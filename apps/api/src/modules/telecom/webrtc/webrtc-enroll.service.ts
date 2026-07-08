import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceType, TenantStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../auth/jwt.util';
import { SipCredentialVaultService } from '../auth/sip-credential-vault.service';
import type {
  WebrtcEnrollRequestDto,
  WebrtcEnrollRevokeRequestDto,
} from '../dto/telecom.request.dto';
import type {
  WebrtcEnrollResponseDto,
  WebrtcEnrollRevokeResponseDto,
  WebrtcIceServerDto,
} from '../dto/telecom.response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TelecomRedisService } from '../redis/telecom-redis.service';

/**
 * Phase 10 — JWT-gated WebRTC enrollment (ADR-038 / TEL-WRTC-001).
 * Issues short-lived SIP digest credentials; never stores SDP/ICE in Prisma.
 */
@Injectable()
export class WebrtcEnrollService {
  private readonly logger = new Logger(WebrtcEnrollService.name);
  private readonly enrollTtlSec: number;
  private readonly platformDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SipCredentialVaultService,
    private readonly redis: TelecomRedisService,
    private readonly config: ConfigService,
  ) {
    this.enrollTtlSec = Number(config.get('WEBRTC_ENROLL_TTL_SEC') ?? '900');
    this.platformDomain = config.get<string>('SIP_PLATFORM_DOMAIN', 'vsp.internal');
  }

  async enroll(user: JwtPayload, dto: WebrtcEnrollRequestDto): Promise<WebrtcEnrollResponseDto> {
    if (!this.prisma.connected) {
      throw new ForbiddenException('Enrollment unavailable');
    }

    const device = await this.resolveWebrtcDevice(user, dto.deviceId);
    if (!device?.sipEndpoint) {
      throw new NotFoundException('WEBRTC device with SIPEndpoint required');
    }

    const tenant = device.tenant;
    if (tenant.status !== TenantStatus.ACTIVE && tenant.status !== TenantStatus.PENDING) {
      throw new ForbiddenException('Tenant inactive');
    }

    const realm = `${tenant.slug}.sip.${this.platformDomain}`;
    const sipPassword = randomBytes(18).toString('base64url');
    const version = `enroll-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.enrollTtlSec * 1000).toISOString();

    this.vault.registerEnrollCredential({
      sipEndpointId: device.sipEndpoint.id,
      authUsername: device.sipEndpoint.authUsername,
      realm,
      password: sipPassword,
      ttlSec: this.enrollTtlSec,
      version,
    });

    await this.redis.setex(
      this.redis.webrtcEnrollKey(tenant.id, device.sipEndpoint.id),
      this.enrollTtlSec,
      JSON.stringify({
        deviceId: device.id,
        sipEndpointId: device.sipEndpoint.id,
        userId: user.sub,
        version,
        expiresAt,
      }),
    );

    const wssUrl = this.wssUrl();
    const iceServers = this.iceServers();

    this.logger.log(
      JSON.stringify({
        event: 'telecom.webrtc.enroll',
        tenantId: tenant.id,
        deviceId: device.id,
        sipEndpointId: device.sipEndpoint.id,
        userId: user.sub,
        expiresAt,
      }),
    );

    return {
      sipUsername: device.sipEndpoint.authUsername,
      sipPassword,
      aor: device.sipEndpoint.aor,
      realm,
      wssUrl,
      expiresAt,
      iceServers,
      deviceId: device.id,
      sipEndpointId: device.sipEndpoint.id,
      enrollTtlSec: this.enrollTtlSec,
    };
  }

  async revoke(
    user: JwtPayload,
    dto: WebrtcEnrollRevokeRequestDto,
  ): Promise<WebrtcEnrollRevokeResponseDto> {
    const device = await this.resolveWebrtcDevice(user, dto.deviceId);
    if (!device?.sipEndpoint) {
      throw new NotFoundException('Device not found');
    }

    this.vault.revokeEnrollCredential(device.sipEndpoint.id);
    await this.redis.del(this.redis.webrtcEnrollKey(device.tenantId, device.sipEndpoint.id));

    this.logger.log(
      JSON.stringify({
        event: 'telecom.webrtc.enroll_revoke',
        tenantId: device.tenantId,
        deviceId: device.id,
        userId: user.sub,
      }),
    );

    return { ok: true, deviceId: device.id };
  }

  private async resolveWebrtcDevice(user: JwtPayload, deviceId?: string) {
    if (deviceId) {
      return this.prisma.device.findFirst({
        where: {
          id: deviceId,
          tenantId: user.tenantId,
          deletedAt: null,
          deviceType: DeviceType.WEBRTC,
          userId: user.sub,
        },
        include: { sipEndpoint: true, tenant: true },
      });
    }

    return this.prisma.device.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.sub,
        deletedAt: null,
        deviceType: DeviceType.WEBRTC,
      },
      include: { sipEndpoint: true, tenant: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private wssUrl(): string {
    return (
      this.config.get<string>('WEBRTC_WSS_URL') ||
      `wss://localhost:${this.config.get('KAMAILIO_WSS_PORT') ?? '8443'}`
    );
  }

  private iceServers(): WebrtcIceServerDto[] {
    const servers: WebrtcIceServerDto[] = [];
    const stun = (this.config.get<string>('WEBRTC_STUN_URL') || 'stun:stun.l.google.com:19302').trim();
    if (stun) {
      servers.push({ urls: stun });
    }
    const turnUrl = (this.config.get<string>('WEBRTC_TURN_URL') || '').trim();
    const turnUser = (this.config.get<string>('WEBRTC_TURN_USERNAME') || '').trim();
    const turnPass = (this.config.get<string>('WEBRTC_TURN_PASSWORD') || '').trim();
    if (turnUrl) {
      servers.push({
        urls: turnUrl,
        username: turnUser || undefined,
        credential: turnPass || undefined,
      });
    }
    return servers;
  }
}
