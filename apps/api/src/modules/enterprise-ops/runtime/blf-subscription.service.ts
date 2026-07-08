import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PresenceStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PresenceService } from '../../presence/presence.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { BLF_EVENTS, type BlfEventPayload, type BlfLampState } from '../events/blf.events';

const BLF_TTL_SEC = 86_400;

/** Phase 14 — BLF subscription registry (Redis runtime; no Prisma). */
@Injectable()
export class BlfSubscriptionService {
  private readonly logger = new Logger(BlfSubscriptionService.name);

  constructor(
    private readonly redis: TelecomRedisService,
    private readonly presence: PresenceService,
    private readonly events: EventEmitter2,
  ) {}

  async subscribe(params: {
    tenantId: string;
    watcherDeviceId: string;
    watchedLineIds: string[];
  }): Promise<{ subscribed: string[] }> {
    const subsKey = this.redis.blfSubsKey(params.tenantId, params.watcherDeviceId);
    const existing = await this.readJsonArray(subsKey);
    const merged = [...new Set([...existing, ...params.watchedLineIds])];
    await this.redis.setex(subsKey, BLF_TTL_SEC, JSON.stringify(merged));

    for (const lineId of params.watchedLineIds) {
      const watchersKey = this.redis.blfWatchersKey(params.tenantId, lineId);
      const watchers = await this.readJsonArray(watchersKey);
      if (!watchers.includes(params.watcherDeviceId)) {
        watchers.push(params.watcherDeviceId);
        await this.redis.setex(watchersKey, BLF_TTL_SEC, JSON.stringify(watchers));
      }
      const lamp = await this.lampStateForLine(params.tenantId, lineId);
      this.emit(BLF_EVENTS.SUBSCRIBED, {
        tenantId: params.tenantId,
        watcherDeviceId: params.watcherDeviceId,
        watchedLineId: lineId,
        lampState: lamp,
      });
    }

    return { subscribed: merged };
  }

  async unsubscribe(params: {
    tenantId: string;
    watcherDeviceId: string;
    watchedLineIds?: string[];
  }): Promise<void> {
    const subsKey = this.redis.blfSubsKey(params.tenantId, params.watcherDeviceId);
    const existing = await this.readJsonArray(subsKey);
    const remove = params.watchedLineIds ?? existing;
    const next = existing.filter((id) => !remove.includes(id));
    await this.redis.setex(subsKey, BLF_TTL_SEC, JSON.stringify(next));

    for (const lineId of remove) {
      const watchersKey = this.redis.blfWatchersKey(params.tenantId, lineId);
      const watchers = (await this.readJsonArray(watchersKey)).filter(
        (id) => id !== params.watcherDeviceId,
      );
      await this.redis.setex(watchersKey, BLF_TTL_SEC, JSON.stringify(watchers));
      this.emit(BLF_EVENTS.UNSUBSCRIBED, {
        tenantId: params.tenantId,
        watcherDeviceId: params.watcherDeviceId,
        watchedLineId: lineId,
        lampState: 'idle',
      });
    }
  }

  async watchersForLine(tenantId: string, lineId: string): Promise<string[]> {
    return this.readJsonArray(this.redis.blfWatchersKey(tenantId, lineId));
  }

  async lampStateForLine(tenantId: string, lineId: string): Promise<BlfLampState> {
    const ringing = await this.redis.get(this.redis.pickupRingingKey(tenantId, lineId));
    if (ringing) return 'ringing';

    const presence = await this.presence.getLinePresence(tenantId, lineId);
    const status = (presence as { status?: PresenceStatus } | null)?.status;
    switch (status) {
      case PresenceStatus.ON_CALL:
      case PresenceStatus.BUSY:
        return 'busy';
      case PresenceStatus.DND:
        return 'dnd';
      case PresenceStatus.OFFLINE:
        return 'offline';
      default:
        return 'idle';
    }
  }

  private emit(
    type: BlfEventPayload['type'],
    params: Omit<BlfEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: BlfEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }

  private async readJsonArray(key: string): Promise<string[]> {
    const raw = await this.redis.get(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
}
