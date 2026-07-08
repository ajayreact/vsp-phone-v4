import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PRESENCE_EVENTS, type PresenceChangedPayload } from '../../presence/events/presence.events';
import { CALL_EVENTS, type CallLifecyclePayload } from '../../telecom/events/call.events';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { BLF_EVENTS, type BlfEventPayload } from '../events/blf.events';
import { BlfSubscriptionService } from './blf-subscription.service';

const NOTIFY_TTL_SEC = 300;

/** Phase 14 — presence-driven BLF lamp updates + Redis notification queue. */
@Injectable()
export class BlfNotifyService {
  private readonly logger = new Logger(BlfNotifyService.name);

  constructor(
    private readonly blf: BlfSubscriptionService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(PRESENCE_EVENTS.CHANGED)
  async onPresenceChanged(payload: PresenceChangedPayload): Promise<void> {
    await this.notifyLineWatchers(payload.tenantId, payload.lineId, payload.platformUuid);
  }

  @OnEvent(CALL_EVENTS.RINGING)
  async onCallRinging(payload: CallLifecyclePayload): Promise<void> {
    const session = await this.redis.get(
      this.redis.callRuntimeKey(payload.tenantId, payload.platformUuid),
    );
    let toLineId: string | undefined;
    if (session) {
      try {
        toLineId = (JSON.parse(session) as { toLineId?: string }).toLineId;
      } catch {
        /* ignore */
      }
    }
    if (toLineId) {
      await this.notifyLineWatchers(payload.tenantId, toLineId, payload.platformUuid);
    }
  }

  @OnEvent(CALL_EVENTS.ANSWERED)
  @OnEvent(CALL_EVENTS.ENDED)
  async onCallLifecycle(payload: CallLifecyclePayload): Promise<void> {
    const keys = await this.redis.get(this.redis.pickupRingingKey(payload.tenantId, 'index'));
    void keys;
    await this.notifyAllWatchersForCall(payload.tenantId, payload.platformUuid);
  }

  async notifyLineWatchers(tenantId: string, lineId: string, platformUuid?: string): Promise<void> {
    const watchers = await this.blf.watchersForLine(tenantId, lineId);
    const lampState = await this.blf.lampStateForLine(tenantId, lineId);
    for (const watcherDeviceId of watchers) {
      const payload: BlfEventPayload = {
        eventId: randomUUID(),
        type: BLF_EVENTS.LAMP_CHANGED,
        tenantId,
        watcherDeviceId,
        watchedLineId: lineId,
        lampState,
        platformUuid,
        ts: new Date().toISOString(),
      };
      this.events.emit(BLF_EVENTS.LAMP_CHANGED, payload);
      await this.redis.setex(
        this.redis.presenceNotifyKey(tenantId, watcherDeviceId),
        NOTIFY_TTL_SEC,
        JSON.stringify({ lineId, lampState, platformUuid, ts: payload.ts }),
      );
      this.logger.log(JSON.stringify({ event: BLF_EVENTS.LAMP_CHANGED, ...payload }));
    }
  }

  private async notifyAllWatchersForCall(tenantId: string, platformUuid: string): Promise<void> {
    const runtime = await this.redis.get(this.redis.callRuntimeKey(tenantId, platformUuid));
    if (!runtime) return;
    try {
      const parsed = JSON.parse(runtime) as { toLineId?: string };
      if (parsed.toLineId) {
        await this.notifyLineWatchers(tenantId, parsed.toLineId, platformUuid);
      }
    } catch {
      /* ignore */
    }
  }
}
