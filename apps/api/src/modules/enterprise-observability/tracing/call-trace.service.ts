import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { TraceSpan } from '../logging/logging.types';

const TRACE_TTL_SEC = 86_400;
const MAX_TRACE_SPANS = 200;

/** Phase 15 — distributed call tracing via platformUuid (Redis only). */
@Injectable()
export class CallTraceService {
  private readonly logger = new Logger(CallTraceService.name);
  private readonly seenEvents = new Set<string>();

  constructor(private readonly redis: TelecomRedisService) {}

  append(span: Omit<TraceSpan, 'spanId' | 'ts'> & { eventId?: string }): void {
    const dedupeKey = span.eventId ? `${span.platformUuid}:${span.eventId}` : undefined;
    if (dedupeKey && this.seenEvents.has(dedupeKey)) return;
    if (dedupeKey) {
      this.seenEvents.add(dedupeKey);
      if (this.seenEvents.size > 10_000) this.seenEvents.clear();
    }

    const entry: TraceSpan = {
      spanId: randomUUID(),
      ts: new Date().toISOString(),
      ...span,
    };

    setImmediate(() => {
      void this.persist(entry);
    });
  }

  async getTrace(tenantId: string, platformUuid: string): Promise<TraceSpan[]> {
    const raw = await this.redis.lrange(this.redis.traceKey(tenantId, platformUuid), 0, MAX_TRACE_SPANS - 1);
    const spans: TraceSpan[] = [];
    for (const line of raw) {
      try {
        spans.push(JSON.parse(line) as TraceSpan);
      } catch {
        /* skip */
      }
    }
    return spans.reverse();
  }

  private async persist(entry: TraceSpan): Promise<void> {
    const key = this.redis.traceKey(entry.tenantId, entry.platformUuid);
    await this.redis.lpushUnbounded(key, JSON.stringify(entry));
    await this.redis.expire(key, TRACE_TTL_SEC);
    this.logger.debug(JSON.stringify({ event: 'trace.span', platformUuid: entry.platformUuid, operation: entry.operation }));
  }
}
