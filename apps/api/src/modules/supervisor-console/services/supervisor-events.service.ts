import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CALL_EVENTS } from '../../telecom/events/call.events';
import { PRESENCE_EVENTS } from '../../presence/events/presence.events';
import { SUPERVISOR_EVENTS } from '../../enterprise-ops/events/supervisor.events';

export type SupervisorStreamEvent = {
  type: string;
  tenantId: string;
  ts: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class SupervisorEventsService {
  private readonly streams = new Map<string, Subject<SupervisorStreamEvent>>();

  subscribe(tenantId: string): Observable<MessageEvent> {
    if (!this.streams.has(tenantId)) {
      this.streams.set(tenantId, new Subject());
    }
    const subject = this.streams.get(tenantId)!;
    return subject.asObservable().pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  publish(tenantId: string, payload: Record<string, unknown>) {
    const event: SupervisorStreamEvent = {
      type: String(payload.type ?? 'update'),
      tenantId,
      ts: new Date().toISOString(),
      payload,
    };
    this.streams.get(tenantId)?.next(event);
  }

  @OnEvent(CALL_EVENTS.ANSWERED)
  onCallAnswered(payload: { tenantId: string; platformUuid: string }) {
    this.publish(payload.tenantId, { type: 'call_answered', platformUuid: payload.platformUuid });
  }

  @OnEvent(CALL_EVENTS.ENDED)
  onCallEnded(payload: { tenantId: string; platformUuid: string }) {
    this.publish(payload.tenantId, { type: 'call_ended', platformUuid: payload.platformUuid });
  }

  @OnEvent(PRESENCE_EVENTS.CHANGED)
  onPresenceChanged(payload: { tenantId: string; lineId: string; status: string }) {
    this.publish(payload.tenantId, { type: 'agent_status', lineId: payload.lineId, status: payload.status });
  }

  @OnEvent(SUPERVISOR_EVENTS.MONITOR_STARTED)
  @OnEvent(SUPERVISOR_EVENTS.WHISPER_STARTED)
  @OnEvent(SUPERVISOR_EVENTS.BARGE_STARTED)
  onSupervisor(payload: { tenantId: string; targetPlatformUuid: string; mode?: string; type: string }) {
    this.publish(payload.tenantId, {
      type: 'supervisor_action',
      platformUuid: payload.targetPlatformUuid,
      mode: payload.mode,
      event: payload.type,
    });
  }
}
