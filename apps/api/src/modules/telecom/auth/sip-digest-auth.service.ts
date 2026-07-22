import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { TenantStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticateRequestDto } from '../dto/telecom.request.dto';
import type { AuthenticateResponseDto } from '../dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../dto/telecom.request.dto';
import type { TelecomCallMeta } from '../telecom.service.interface';
import { computeDigestResponse, safeEqualHex } from './sip-digest.crypto';
import { SipCredentialVaultService } from './sip-credential-vault.service';
import { TelecomRedisService } from '../redis/telecom-redis.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  REGISTRATION_EVENTS,
  type RegistrationAuthFailedPayload,
} from '../events/registration.events';
import {
  hasActiveAssignment,
  pickRegistrableDevice,
} from '../sip/sip-endpoint-devices.util';
import { isAcceptedDigestRealm } from '../sip/sip-realm.util';

const AUTH_CACHE_TTL_SEC = 30;

const deviceInclude = {
  where: { deletedAt: null },
  include: {
    assignments: {
      where: { deletedAt: null, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' as const },
      take: 1,
    },
  },
};

@Injectable()
export class SipDigestAuthService {
  private readonly logger = new Logger(SipDigestAuthService.name);
  private readonly maxExpires: number;
  private readonly platformDomain: string;
  private readonly registrarHost: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SipCredentialVaultService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.maxExpires = Number(config.get('SIP_DEFAULT_EXPIRES_SEC') ?? 3600);
    this.platformDomain = config.get<string>('SIP_PLATFORM_DOMAIN', 'vsp.internal');
    this.registrarHost = (config.get<string>('SIP_REGISTRAR_HOST') || '').trim();
  }

  async authenticate(
    dto: AuthenticateRequestDto,
    meta: TelecomCallMeta,
  ): Promise<AuthenticateResponseDto> {
    const deny = async (reason: string): Promise<AuthenticateResponseDto> => {
      await this.emitAuthFailed(dto, reason);
      this.logger.warn(
        JSON.stringify({
          event: 'telecom.auth.deny',
          reason,
          username: dto.username,
          realm: dto.realm,
          requestId: meta.requestId,
        }),
      );
      return {
        allow: false,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.authenticate,
        idempotencyKey: meta.idempotencyKey,
      };
    };

    const cacheKey = this.redis.authCacheKey(dto.username, dto.nonce);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as AuthenticateResponseDto;
        if (parsed.allow) {
          this.logger.debug(
            JSON.stringify({ event: 'telecom.auth.cache_hit', username: dto.username }),
          );
          return { ...parsed, idempotencyKey: meta.idempotencyKey };
        }
      } catch {
        /* ignore bad cache */
      }
    }

    if (!this.prisma.connected) {
      return deny('prisma_unavailable');
    }

    const aorNorm = normalizeAor(dto.aor);
    let endpoint = await this.prisma.sIPEndpoint.findFirst({
      where: {
        deletedAt: null,
        aor: { equals: aorNorm, mode: 'insensitive' },
      },
      include: {
        tenant: true,
        devices: deviceInclude,
      },
    });

    if (!endpoint) {
      endpoint = await this.prisma.sIPEndpoint.findFirst({
        where: {
          deletedAt: null,
          authUsername: dto.username,
        },
        include: {
          tenant: true,
          devices: deviceInclude,
        },
      });
    }

    if (!endpoint) {
      return deny('unknown_endpoint');
    }

    if (
      endpoint.tenant.status !== TenantStatus.ACTIVE &&
      endpoint.tenant.status !== TenantStatus.PENDING
    ) {
      return deny('tenant_inactive');
    }

    const realmOk = isAcceptedDigestRealm({
      realm: dto.realm,
      tenantSlug: endpoint.tenant.slug,
      platformDomain: this.platformDomain,
      endpointAor: endpoint.aor,
      registrarHost: this.registrarHost || undefined,
    });

    if (!realmOk) {
      return deny('realm_mismatch');
    }

    if (endpoint.authUsername !== dto.username) {
      return deny('username_mismatch');
    }

    const device = pickRegistrableDevice(endpoint.devices);
    if (!device) {
      return deny('device_missing');
    }

    const activeAssignment = device.assignments?.[0];
    // Line-bound devices may authenticate without DeviceAssignment (Extension-First WEBRTC).
    if (!activeAssignment && !device.lineId) {
      return deny('device_assignment_inactive');
    }

    if (activeAssignment && activeAssignment.tenantId !== endpoint.tenantId) {
      return deny('tenant_isolation_violation');
    }

    await this.vault.rehydrateDeskCredential(endpoint.id);

    const cred = await this.vault.resolveHa1({
      sipEndpointId: endpoint.id,
      authUsername: endpoint.authUsername,
      realm: dto.realm,
    });
    if (!cred) {
      return deny('credential_unavailable');
    }

    const expected = computeDigestResponse({
      ha1: cred.ha1,
      nonce: dto.nonce,
      method: dto.method,
      uri: dto.uri,
    });

    if (!safeEqualHex(expected, dto.response)) {
      return deny('bad_digest');
    }

    const allow: AuthenticateResponseDto = {
      allow: true,
      tenantId: endpoint.tenantId,
      deviceId: device.id,
      lineId: device.lineId ?? activeAssignment?.lineId ?? undefined,
      expiresSec: Math.min(this.maxExpires, 3600),
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.authenticate,
      idempotencyKey: meta.idempotencyKey,
    };

    await this.redis.setex(cacheKey, AUTH_CACHE_TTL_SEC, JSON.stringify(allow));

    this.logger.log(
      JSON.stringify({
        event: 'telecom.auth.allow',
        tenantId: allow.tenantId,
        deviceId: allow.deviceId,
        sipEndpointId: endpoint.id,
        hasAssignment: hasActiveAssignment(device),
        requestId: meta.requestId,
      }),
    );

    return allow;
  }

  private async emitAuthFailed(dto: AuthenticateRequestDto, reason: string): Promise<void> {
    const payload: RegistrationAuthFailedPayload = {
      eventId: randomUUID(),
      type: REGISTRATION_EVENTS.AUTH_FAILED,
      aor: dto.aor,
      username: dto.username,
      realm: dto.realm,
      srcIp: dto.srcIp,
      reason,
      ts: new Date().toISOString(),
    };
    this.events.emit(REGISTRATION_EVENTS.AUTH_FAILED, payload);
  }
}

function normalizeAor(aor: string): string {
  return aor.trim().replace(/^<|>$/g, '');
}
