import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PresenceStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  PRESENCE_EVENTS,
  type DevicePresenceChangedPayload,
} from '../../presence/events/presence.events';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { PresenceSubscriptionService } from '../../presence/subscription/presence-subscription.service';
import { PRESENCE_NOTIFY_EVENTS, type PresenceNotificationPayload } from '../events/presence-notify.events';

const DEVICE_INDEX_TTL_SEC = 86_400;

/** Phase 14 — multi-device state sync + presence device index maintenance. */
@Injectable()
export class DeviceStateSyncService {
  private readonly logger = new Logger(DeviceStateSyncService.name);

  constructor(
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
  ) {}

  async registerDeviceOnLine(params: {
    tenantId: string;
    lineId: string;
    deviceId: string;
    status: PresenceStatus;
  }): Promise<void> {
    const indexKey = this.redis.presenceDeviceIndexKey(params.tenantId, params.lineId);
    const existing = await this.readJsonArray(indexKey);
    if (!existing.includes(params.deviceId)) {
      existing.push(params.deviceId);
      await this.redis.setex(indexKey, DEVICE_INDEX_TTL_SEC, JSON.stringify(existing));
    }

    await this.redis.setex(
      this.redis.presenceDeviceKey(params.tenantId, params.deviceId),
      DEVICE_INDEX_TTL_SEC,
      JSON.stringify({
        deviceId: params.deviceId,
        lineId: params.lineId,
        status: params.status,
        ts: new Date().toISOString(),
      }),
    );

    const payload: DevicePresenceChangedPayload = {
      eventId: randomUUID(),
      type: PRESENCE_EVENTS.DEVICE_CHANGED,
      tenantId: params.tenantId,
      deviceId: params.deviceId,
      lineId: params.lineId,
      status: params.status,
      ts: new Date().toISOString(),
    };
    this.events.emit(PRESENCE_EVENTS.DEVICE_CHANGED, payload);
    this.logger.log(JSON.stringify({ event: PRESENCE_EVENTS.DEVICE_CHANGED, ...payload }));
  }

  async unregisterDevice(params: {
    tenantId: string;
    lineId: string;
    deviceId: string;
  }): Promise<void> {
    const indexKey = this.redis.presenceDeviceIndexKey(params.tenantId, params.lineId);
    const existing = (await this.readJsonArray(indexKey)).filter((id) => id !== params.deviceId);
    await this.redis.setex(indexKey, DEVICE_INDEX_TTL_SEC, JSON.stringify(existing));
    await this.redis.del(this.redis.presenceDeviceKey(params.tenantId, params.deviceId));
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

/** Phase 14 — presence subscription notifications (Redis queue per device). */
@Injectable()
export class PresenceNotificationService {
  private readonly logger = new Logger(PresenceNotificationService.name);

  constructor(
    private readonly redis: TelecomRedisService,
    private readonly subscriptions: PresenceSubscriptionService,
    private readonly events: EventEmitter2,
  ) {}

  async subscribe(params: {
    tenantId: string;
    subscriberDeviceId: string;
    lineIds: string[];
  }): Promise<{ channels: string[] }> {
    const key = this.redis.presenceSubKey(params.tenantId, params.subscriberDeviceId);
    await this.redis.setex(key, 86_400, JSON.stringify(params.lineIds));
    const channels = params.lineIds.map((lineId) =>
      this.subscriptions.subscriptionChannel(params.tenantId, lineId),
    );
    this.events.emit(PRESENCE_NOTIFY_EVENTS.SUBSCRIPTION_CREATED, {
      tenantId: params.tenantId,
      subscriberDeviceId: params.subscriberDeviceId,
      lineIds: params.lineIds,
    });
    return { channels };
  }

  async notifyLine(params: {
    tenantId: string;
    lineId: string;
    status: string;
    deviceId?: string;
  }): Promise<void> {
    const channel = this.subscriptions.subscriptionChannel(params.tenantId, params.lineId);
    const payload: PresenceNotificationPayload = {
      eventId: randomUUID(),
      type: PRESENCE_NOTIFY_EVENTS.NOTIFICATION,
      tenantId: params.tenantId,
      lineId: params.lineId,
      deviceId: params.deviceId,
      status: params.status,
      channel,
      ts: new Date().toISOString(),
    };
    this.events.emit(PRESENCE_NOTIFY_EVENTS.NOTIFICATION, payload);
    await this.redis.setex(
      this.redis.presenceNotifyKey(params.tenantId, params.lineId),
      300,
      JSON.stringify(payload),
    );
    this.logger.log(JSON.stringify({ event: PRESENCE_NOTIFY_EVENTS.NOTIFICATION, ...payload }));
  }
}
