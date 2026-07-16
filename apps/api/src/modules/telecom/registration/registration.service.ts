import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeviceStatus, SIPEndpointStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TELECOM_TIMEOUTS_MS } from '../dto/telecom.request.dto';
import type {
  RegisterRequestDto,
  UnregisterRequestDto,
} from '../dto/telecom.request.dto';
import type {
  RegisterResponseDto,
  UnregisterResponseDto,
} from '../dto/telecom.response.dto';
import type { TelecomCallMeta } from '../telecom.service.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TelecomRedisService } from '../redis/telecom-redis.service';
import {
  REGISTRATION_EVENTS,
  type RegistrationContactBinding,
  type RegistrationCreatedPayload,
  type RegistrationRemovedPayload,
} from '../events/registration.events';
import { pickRegistrableDevice } from '../sip/sip-endpoint-devices.util';

const devicesInclude = {
  where: { deletedAt: null },
  include: {
    assignments: {
      where: { deletedAt: null, effectiveTo: null },
      take: 1,
    },
  },
};

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
  ) {}

  async register(
    dto: RegisterRequestDto,
    meta: TelecomCallMeta,
  ): Promise<RegisterResponseDto> {
    // platformUuid is intentionally not required for REGISTER
    if (dto.expires === 0) {
      return this.unregister(
        {
          aor: dto.aor,
          contact: dto.contact,
          deviceId: dto.deviceId,
          tenantId: dto.tenantId,
        },
        meta,
      ).then((r) => ({
        accepted: r.accepted,
        deviceId: dto.deviceId,
        expiresSec: 0,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.register,
        idempotencyKey: meta.idempotencyKey,
      }));
    }

    if (!this.prisma.connected) {
      this.logger.warn(JSON.stringify({ event: 'telecom.reg.prisma_down' }));
      return this.placeholderRegister(dto, meta, false);
    }

    const aor = normalizeAor(dto.aor);
    const endpoint = await this.prisma.sIPEndpoint.findFirst({
      where: {
        deletedAt: null,
        aor: { equals: aor, mode: 'insensitive' },
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      },
      include: {
        devices: devicesInclude,
      },
    });

    const device = pickRegistrableDevice(endpoint?.devices, dto.deviceId);
    if (!endpoint || !device) {
      this.logger.warn(
        JSON.stringify({ event: 'telecom.reg.unknown_aor', aor, deviceId: dto.deviceId }),
      );
      return {
        accepted: false,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.register,
        idempotencyKey: meta.idempotencyKey,
      };
    }

    // Tenant isolation
    if (dto.tenantId && dto.tenantId !== endpoint.tenantId) {
      return {
        accepted: false,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.register,
        idempotencyKey: meta.idempotencyKey,
      };
    }

    // Line-bound devices may register without DeviceAssignment.
    if (!(device.assignments?.length) && !device.lineId) {
      return {
        accepted: false,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.register,
        idempotencyKey: meta.idempotencyKey,
      };
    }

    const expiresSec = Math.min(Math.max(dto.expires, 60), 3600);
    const expiresAt = new Date(Date.now() + expiresSec * 1000).toISOString();
    const contactUri = extractContactUri(dto.contact);
    const binding: RegistrationContactBinding = {
      contact: contactUri,
      expiresAt,
      expiresSec,
      userAgent: dto.userAgent,
      srcIp: dto.srcIp,
      deviceId: device.id,
    };

    const regKey = this.redis.registrationKey(endpoint.tenantId, aor);
    const existing = await this.redis.hgetall(regKey);
    const wasEmpty = Object.keys(existing).length === 0;
    const field = this.redis.contactField(contactUri);
    const refreshed = Boolean(existing[field]);

    await this.redis.hset(regKey, field, JSON.stringify(binding));
    // TTL = max contact expiry across hash (approx using this binding)
    await this.redis.expire(regKey, expiresSec + 30);

    // Purge expired sibling contacts
    await this.purgeExpiredContacts(regKey, existing);

    const after = await this.redis.hgetall(regKey);
    const multiDeviceCount = Object.keys(after).length;

    // Persist business registration status only (never Contact URI in Prisma)
    await this.prisma.sIPEndpoint.update({
      where: { id: endpoint.id },
      data: {
        registrationStatus: SIPEndpointStatus.REGISTERED,
        lastRegisteredAt: new Date(),
      },
    });

    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: DeviceStatus.REGISTERED },
    });

    const eventType = refreshed || !wasEmpty
      ? REGISTRATION_EVENTS.REFRESHED
      : REGISTRATION_EVENTS.CREATED;

    const payload: RegistrationCreatedPayload = {
      eventId: randomUUID(),
      type: eventType,
      tenantId: endpoint.tenantId,
      deviceId: device.id,
      sipEndpointId: endpoint.id,
      lineId: device.lineId ?? undefined,
      aor,
      contact: contactUri,
      expiresAt,
      userAgent: dto.userAgent,
      srcIp: dto.srcIp,
      multiDeviceCount,
      ts: new Date().toISOString(),
    };
    this.events.emit(eventType, payload);

    this.logger.log(
      JSON.stringify({
        event: 'telecom.reg.accepted',
        type: eventType,
        tenantId: endpoint.tenantId,
        deviceId: device.id,
        aor,
        multiDeviceCount,
        requestId: meta.requestId,
      }),
    );

    return {
      accepted: true,
      deviceId: device.id,
      expiresSec,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.register,
      idempotencyKey: meta.idempotencyKey,
    };
  }

  async unregister(
    dto: UnregisterRequestDto,
    meta: TelecomCallMeta,
  ): Promise<UnregisterResponseDto> {
    if (!this.prisma.connected) {
      return {
        accepted: true,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.unregister,
        idempotencyKey: meta.idempotencyKey,
      };
    }

    const aor = normalizeAor(dto.aor);
    const endpoint = await this.prisma.sIPEndpoint.findFirst({
      where: {
        deletedAt: null,
        aor: { equals: aor, mode: 'insensitive' },
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      },
      include: { devices: devicesInclude },
    });

    if (!endpoint) {
      return {
        accepted: true,
        placeholder: false,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.unregister,
        idempotencyKey: meta.idempotencyKey,
      };
    }

    const device = pickRegistrableDevice(endpoint.devices, dto.deviceId);

    const regKey = this.redis.registrationKey(endpoint.tenantId, aor);

    if (dto.contact) {
      const field = this.redis.contactField(extractContactUri(dto.contact));
      await this.redis.hdel(regKey, field);
    } else {
      const all = await this.redis.hgetall(regKey);
      const fields = Object.keys(all);
      if (fields.length) await this.redis.hdel(regKey, ...fields);
    }

    const remaining = await this.redis.hgetall(regKey);
    const remainingCount = Object.keys(remaining).length;

    if (remainingCount === 0) {
      await this.redis.del(regKey);
      await this.prisma.sIPEndpoint.update({
        where: { id: endpoint.id },
        data: { registrationStatus: SIPEndpointStatus.UNREGISTERED },
      });
      if (endpoint.devices.length) {
        await this.prisma.device.updateMany({
          where: { id: { in: endpoint.devices.map((d) => d.id) } },
          data: { status: DeviceStatus.UNREGISTERED },
        });
      }
    } else if (device) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { status: DeviceStatus.UNREGISTERED },
      });
    }

    const payload: RegistrationRemovedPayload = {
      eventId: randomUUID(),
      type: REGISTRATION_EVENTS.UNREGISTERED,
      tenantId: endpoint.tenantId,
      deviceId: device?.id ?? dto.deviceId,
      sipEndpointId: endpoint.id,
      aor,
      contact: dto.contact ? extractContactUri(dto.contact) : undefined,
      reason: 'client_unregister',
      ts: new Date().toISOString(),
    };
    this.events.emit(REGISTRATION_EVENTS.UNREGISTERED, payload);

    this.logger.log(
      JSON.stringify({
        event: 'telecom.reg.unregistered',
        aor,
        remainingCount,
        requestId: meta.requestId,
      }),
    );

    return {
      accepted: true,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.unregister,
      idempotencyKey: meta.idempotencyKey,
    };
  }

  /** Remove expired contacts from Redis usrloc mirror; emit registration.expired. */
  async reconcileExpired(tenantId: string, aor: string): Promise<number> {
    const regKey = this.redis.registrationKey(tenantId, aor);
    const all = await this.redis.hgetall(regKey);
    return this.purgeExpiredContacts(regKey, all, tenantId, aor);
  }

  private async purgeExpiredContacts(
    regKey: string,
    existing: Record<string, string>,
    tenantId?: string,
    aor?: string,
  ): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [field, raw] of Object.entries(existing)) {
      try {
        const binding = JSON.parse(raw) as RegistrationContactBinding;
        if (new Date(binding.expiresAt).getTime() <= now) {
          await this.redis.hdel(regKey, field);
          removed += 1;
          if (tenantId && aor) {
            const payload: RegistrationRemovedPayload = {
              eventId: randomUUID(),
              type: REGISTRATION_EVENTS.EXPIRED,
              tenantId,
              deviceId: binding.deviceId,
              aor,
              contact: binding.contact,
              reason: 'ttl_expired',
              ts: new Date().toISOString(),
            };
            this.events.emit(REGISTRATION_EVENTS.EXPIRED, payload);
          }
        }
      } catch {
        await this.redis.hdel(regKey, field);
        removed += 1;
      }
    }
    return removed;
  }

  private placeholderRegister(
    dto: RegisterRequestDto,
    meta: TelecomCallMeta,
    accepted: boolean,
  ): RegisterResponseDto {
    return {
      accepted,
      deviceId: dto.deviceId,
      expiresSec: dto.expires,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.register,
      idempotencyKey: meta.idempotencyKey,
    };
  }
}

function normalizeAor(aor: string): string {
  return aor.trim().replace(/^<|>$/g, '');
}

function extractContactUri(contact: string): string {
  const m = contact.match(/<?(sip:[^>;\s]+)>?/i);
  return m?.[1] ?? contact.trim();
}
