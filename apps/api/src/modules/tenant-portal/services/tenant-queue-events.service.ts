import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { interval, merge, type Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CALL_EVENTS } from '../../telecom/events/call.events';
import { PRESENCE_EVENTS } from '../../presence/events/presence.events';
import { TenantQueuesService } from './tenant-queues.service';

export type TenantQueueStreamEvent = {
  type: string;
  tenantId: string;
  ts: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class TenantQueueEventsService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<TenantQueueStreamEvent>>();
  private readonly pollHandles = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly queues: TenantQueuesService) {}

  subscribe(tenantId: string): Observable<MessageEvent> {
    if (!this.streams.has(tenantId)) {
      this.streams.set(tenantId, new Subject());
      this.startPolling(tenantId);
    }

    const subject = this.streams.get(tenantId)!;
    const heartbeat = interval(15000).pipe(
      map(() => ({
        type: 'heartbeat',
        tenantId,
        ts: new Date().toISOString(),
        payload: {},
      })),
    );

    return merge(subject.asObservable(), heartbeat).pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  onModuleDestroy() {
    for (const handle of this.pollHandles.values()) {
      clearInterval(handle);
    }
  }

  private startPolling(tenantId: string) {
    const handle = setInterval(() => {
      void this.publishDashboard(tenantId);
    }, 5000);
    this.pollHandles.set(tenantId, handle);
  }

  private async publishDashboard(tenantId: string) {
    try {
      const dashboard = await this.queues.getDashboard(tenantId);
      this.publish(tenantId, { type: 'queue_dashboard', queues: dashboard });
    } catch {
      /* soft fail */
    }
  }

  private publish(tenantId: string, payload: Record<string, unknown>) {
    const event: TenantQueueStreamEvent = {
      type: String(payload.type ?? 'update'),
      tenantId,
      ts: new Date().toISOString(),
      payload,
    };
    this.streams.get(tenantId)?.next(event);
  }

  @OnEvent(CALL_EVENTS.ANSWERED)
  @OnEvent(CALL_EVENTS.ENDED)
  onCallEvent(payload: { tenantId: string; platformUuid: string; queueId?: string }) {
    this.publish(payload.tenantId, {
      type: 'call_event',
      platformUuid: payload.platformUuid,
      queueId: payload.queueId,
    });
    void this.publishDashboard(payload.tenantId);
  }

  @OnEvent(PRESENCE_EVENTS.CHANGED)
  onPresence(payload: { tenantId: string; lineId: string; status: string }) {
    this.publish(payload.tenantId, {
      type: 'agent_status',
      lineId: payload.lineId,
      status: payload.status,
    });
  }
}
