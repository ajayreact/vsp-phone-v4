import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BLF_EVENTS } from '../../enterprise-ops/events/blf.events';
import { PARK_PICKUP_EVENTS } from '../../enterprise-ops/events/park-pickup.events';
import { PRESENCE_EVENTS } from '../../presence/events/presence.events';
import { CALL_EVENTS } from '../../telecom/events/call.events';

export type ReceptionStreamEvent = {
  type: string;
  tenantId: string;
  ts: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class TenantReceptionEventsService {
  private readonly streams = new Map<string, Subject<ReceptionStreamEvent>>();

  subscribe(tenantId: string): Observable<MessageEvent> {
    if (!this.streams.has(tenantId)) {
      this.streams.set(tenantId, new Subject());
    }
    return this.streams.get(tenantId)!.asObservable().pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  publish(tenantId: string, type: string, payload: Record<string, unknown> = {}) {
    const event: ReceptionStreamEvent = {
      type,
      tenantId,
      ts: new Date().toISOString(),
      payload,
    };
    this.streams.get(tenantId)?.next(event);
  }

  @OnEvent(PRESENCE_EVENTS.CHANGED)
  onPresence(payload: { tenantId: string; lineId: string; status: string }) {
    this.publish(payload.tenantId, 'presence', { lineId: payload.lineId, status: payload.status });
  }

  @OnEvent(BLF_EVENTS.LAMP_CHANGED)
  onBlf(payload: { tenantId: string; watchedLineId: string; lampState: string }) {
    this.publish(payload.tenantId, 'blf', { lineId: payload.watchedLineId, lampState: payload.lampState });
  }

  @OnEvent(PARK_PICKUP_EVENTS.PARKED)
  onParked(payload: { tenantId: string; slot: string; platformUuid: string }) {
    this.publish(payload.tenantId, 'park', { slot: payload.slot, platformUuid: payload.platformUuid, action: 'parked' });
  }

  @OnEvent(PARK_PICKUP_EVENTS.RETRIEVED)
  onRetrieved(payload: { tenantId: string; slot: string; platformUuid: string }) {
    this.publish(payload.tenantId, 'park', { slot: payload.slot, platformUuid: payload.platformUuid, action: 'retrieved' });
  }

  @OnEvent(PARK_PICKUP_EVENTS.PICKUP_ANSWERED)
  onPickup(payload: { tenantId: string; platformUuid: string; pickupMode: string }) {
    this.publish(payload.tenantId, 'pickup', { platformUuid: payload.platformUuid, mode: payload.pickupMode });
  }

  @OnEvent(CALL_EVENTS.ANSWERED)
  onAnswered(payload: { tenantId: string; platformUuid: string }) {
    this.publish(payload.tenantId, 'call', { platformUuid: payload.platformUuid, state: 'answered' });
  }

  @OnEvent(CALL_EVENTS.ENDED)
  onEnded(payload: { tenantId: string; platformUuid: string }) {
    this.publish(payload.tenantId, 'call', { platformUuid: payload.platformUuid, state: 'ended' });
  }

  @OnEvent(CALL_EVENTS.RINGING)
  onRinging(payload: { tenantId: string; platformUuid: string }) {
    this.publish(payload.tenantId, 'call', { platformUuid: payload.platformUuid, state: 'ringing' });
  }
}
