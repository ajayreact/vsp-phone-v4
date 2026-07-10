import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { interval, merge, type Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { TenantCallRoutesService } from './tenant-call-routes.service';
import { TenantIvrService } from './tenant-ivr.service';

export type TenantRoutingStreamEvent = {
  type: string;
  tenantId: string;
  ts: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class TenantRoutingEventsService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<TenantRoutingStreamEvent>>();
  private readonly pollHandles = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly routes: TenantCallRoutesService,
    private readonly ivr: TenantIvrService,
  ) {}

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
      void this.publishMetrics(tenantId);
    }, 5000);
    this.pollHandles.set(tenantId, handle);
  }

  private async publishMetrics(tenantId: string) {
    try {
      const metrics = await this.routes.getLiveMetrics(tenantId);
      this.publish(tenantId, { type: 'routing_metrics', ...metrics });
    } catch {
      /* soft fail */
    }
  }

  private publish(tenantId: string, payload: Record<string, unknown>) {
    const event: TenantRoutingStreamEvent = {
      type: String(payload.type ?? 'update'),
      tenantId,
      ts: new Date().toISOString(),
      payload,
    };
    this.streams.get(tenantId)?.next(event);
  }
}
