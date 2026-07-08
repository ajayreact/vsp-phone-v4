import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PresenceStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../telecom/redis/telecom-redis.service';
import { PRESENCE_EVENTS, type PresenceChangedPayload } from './events/presence.events';

const PRESENCE_TTL_SEC = 86_400;

export type PresenceSource = PresenceChangedPayload['source'];

/** Phase 12 — Line/Device presence with Redis runtime cache (ADR-004). */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
  ) {}

  async setLinePresence(params: {
    tenantId: string;
    lineId: string;
    deviceId?: string;
    status: PresenceStatus;
    source: PresenceSource;
    customMessage?: string | null;
    platformUuid?: string;
    skipOverride?: boolean;
  }): Promise<void> {
    if (!this.prisma.connected) return;

    if (!params.skipOverride && params.source !== 'admin' && params.source !== 'browser') {
      const override = await this.redis.get(this.redis.presenceOverrideKey(params.tenantId, params.lineId));
      if (override === PresenceStatus.DND || override === PresenceStatus.AWAY) {
        return;
      }
    }

    const previous = await this.readCachedStatus(params.tenantId, params.lineId);

    await this.prisma.presence.upsert({
      where: { lineId: params.lineId },
      create: {
        id: randomUUID(),
        tenantId: params.tenantId,
        lineId: params.lineId,
        deviceId: params.deviceId ?? null,
        status: params.status,
        customMessage: params.customMessage ?? null,
      },
      update: {
        status: params.status,
        deviceId: params.deviceId ?? undefined,
        customMessage: params.customMessage ?? undefined,
      },
    });

    await this.redis.setex(
      this.redis.presenceLineKey(params.tenantId, params.lineId),
      PRESENCE_TTL_SEC,
      JSON.stringify({
        lineId: params.lineId,
        deviceId: params.deviceId,
        status: params.status,
        source: params.source,
        ts: new Date().toISOString(),
      }),
    );

    if (params.deviceId) {
      await this.redis.setex(
        this.redis.presenceDeviceKey(params.tenantId, params.deviceId),
        PRESENCE_TTL_SEC,
        JSON.stringify({ deviceId: params.deviceId, lineId: params.lineId, status: params.status }),
      );
      const indexKey = this.redis.presenceDeviceIndexKey(params.tenantId, params.lineId);
      const existing = await this.readDeviceIndex(indexKey);
      if (!existing.includes(params.deviceId)) {
        existing.push(params.deviceId);
        await this.redis.setex(indexKey, PRESENCE_TTL_SEC, JSON.stringify(existing));
      }
    }

    const payload: PresenceChangedPayload = {
      eventId: randomUUID(),
      type: PRESENCE_EVENTS.CHANGED,
      tenantId: params.tenantId,
      lineId: params.lineId,
      deviceId: params.deviceId,
      status: params.status,
      previousStatus: previous ?? undefined,
      source: params.source,
      platformUuid: params.platformUuid,
      ts: new Date().toISOString(),
    };
    this.events.emit(PRESENCE_EVENTS.CHANGED, payload);
    this.logger.log(JSON.stringify({ event: PRESENCE_EVENTS.CHANGED, ...payload }));
  }

  async pushPriorStatus(tenantId: string, lineId: string, status: PresenceStatus): Promise<void> {
    await this.redis.lpush(
      this.redis.presenceStackKey(tenantId, lineId),
      JSON.stringify({ status, ts: new Date().toISOString() }),
    );
  }

  async restorePriorStatus(tenantId: string, lineId: string, deviceId?: string): Promise<void> {
    const stack = await this.redis.lrange(this.redis.presenceStackKey(tenantId, lineId), 0, 0);
    let status: PresenceStatus = PresenceStatus.AVAILABLE;
    if (stack.length) {
      try {
        status = (JSON.parse(stack[0]) as { status: PresenceStatus }).status;
      } catch {
        status = PresenceStatus.AVAILABLE;
      }
    }
    const registered = await this.lineHasRegistration(tenantId, lineId);
    if (!registered) {
      status = PresenceStatus.OFFLINE;
    }
    await this.setLinePresence({
      tenantId,
      lineId,
      deviceId,
      status,
      source: 'call',
      skipOverride: true,
    });
  }

  async setAdminOverride(params: {
    tenantId: string;
    lineId: string;
    status: PresenceStatus;
    customMessage?: string;
    userId: string;
  }): Promise<{ lineId: string; status: PresenceStatus }> {
    if (params.status === PresenceStatus.DND || params.status === PresenceStatus.AWAY) {
      await this.redis.setex(
        this.redis.presenceOverrideKey(params.tenantId, params.lineId),
        PRESENCE_TTL_SEC,
        params.status,
      );
    } else {
      await this.redis.del(this.redis.presenceOverrideKey(params.tenantId, params.lineId));
    }
    await this.setLinePresence({
      tenantId: params.tenantId,
      lineId: params.lineId,
      status: params.status,
      source: 'admin',
      customMessage: params.customMessage ?? null,
      skipOverride: true,
    });
    void params.userId;
    return { lineId: params.lineId, status: params.status };
  }

  async getLinePresence(tenantId: string, lineId: string) {
    const cached = await this.redis.get(this.redis.presenceLineKey(tenantId, lineId));
    if (cached) {
      try {
        return JSON.parse(cached) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    if (!this.prisma.connected) return null;
    const row = await this.prisma.presence.findFirst({
      where: { tenantId, lineId, deletedAt: null },
    });
    return row;
  }

  async aggregateLineStatus(tenantId: string, lineId: string): Promise<PresenceStatus> {
    const devices = await this.redis.lrange(this.redis.presenceDeviceIndexKey(tenantId, lineId), 0, 49);
    if (!devices.length) {
      return (await this.readCachedStatus(tenantId, lineId)) ?? PresenceStatus.OFFLINE;
    }
    const statuses: PresenceStatus[] = [];
    for (const deviceId of devices) {
      const raw = await this.redis.get(this.redis.presenceDeviceKey(tenantId, deviceId));
      if (!raw) continue;
      try {
        statuses.push((JSON.parse(raw) as { status: PresenceStatus }).status);
      } catch {
        /* skip */
      }
    }
    if (statuses.includes(PresenceStatus.ON_CALL)) return PresenceStatus.ON_CALL;
    if (statuses.includes(PresenceStatus.BUSY)) return PresenceStatus.BUSY;
    if (statuses.includes(PresenceStatus.AVAILABLE)) return PresenceStatus.AVAILABLE;
    return PresenceStatus.OFFLINE;
  }

  private async readCachedStatus(tenantId: string, lineId: string): Promise<PresenceStatus | null> {
    const cached = await this.redis.get(this.redis.presenceLineKey(tenantId, lineId));
    if (!cached) return null;
    try {
      return (JSON.parse(cached) as { status: PresenceStatus }).status;
    } catch {
      return null;
    }
  }

  private async readDeviceIndex(indexKey: string): Promise<string[]> {
    const raw = await this.redis.get(indexKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  private async lineHasRegistration(tenantId: string, lineId: string): Promise<boolean> {
    const count = await this.prisma.device.count({
      where: {
        tenantId,
        lineId,
        deletedAt: null,
        status: { in: ['REGISTERED', 'ONLINE', 'BUSY'] },
      },
    });
    return count > 0;
  }
}
