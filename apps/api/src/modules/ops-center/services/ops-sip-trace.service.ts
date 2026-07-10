import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { CallTraceService } from '../../enterprise-observability/tracing/call-trace.service';
import type { TraceSpan } from '../../enterprise-observability/logging/logging.types';

const SIP_METHODS = ['INVITE', 'REGISTER', 'OPTIONS', 'ACK', 'BYE', 'CANCEL', 'REFER', 'SUBSCRIBE', 'NOTIFY', 'MESSAGE'];

@Injectable()
export class OpsSipTraceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly trace: CallTraceService,
  ) {}

  async search(params: {
    tenantId?: string;
    callId?: string;
    extension?: string;
    number?: string;
    ip?: string;
    method?: string;
    platformUuid?: string;
    limit?: number;
  }) {
    const limit = Math.min(params.limit ?? 100, 500);
    const tenantId = params.tenantId;

    if (params.platformUuid && tenantId) {
      return this.buildLadder(tenantId, params.platformUuid, params.method);
    }

    if (params.callId && tenantId) {
      const session = await this.prisma.callSession.findFirst({
        where: { tenantId, sipCallId: params.callId, deletedAt: null },
      });
      if (session) {
        return this.buildLadder(tenantId, session.platformUuid, params.method);
      }
    }

    const sessions = await this.prisma.callSession.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        ...(params.callId ? { sipCallId: { contains: params.callId } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: { tenantId: true, platformUuid: true, sipCallId: true },
    });

    const ladders = [];
    for (const s of sessions.slice(0, Math.min(limit, 20))) {
      const ladder = await this.buildLadder(s.tenantId, s.platformUuid, params.method);
      if (ladder.messages.length) {
        ladders.push({ platformUuid: s.platformUuid, callId: s.sipCallId, ...ladder });
      }
    }

    return { ladders, count: ladders.length };
  }

  private async buildLadder(tenantId: string, platformUuid: string, methodFilter?: string) {
    const spans = await this.trace.getTrace(tenantId, platformUuid);
    const sipSpans = spans.filter((s) => s.component === 'kamailio' || this.looksLikeSip(s));

    const messages: Array<{
      ts: string;
      method: string;
      direction: string;
      from: string;
      to: string;
      source: string;
      status?: string;
      detail?: Record<string, unknown>;
    }> = sipSpans
      .map((s) => this.spanToSipMessage(s))
      .filter((m) => {
        if (methodFilter && m.method !== methodFilter.toUpperCase()) return false;
        return SIP_METHODS.includes(m.method);
      });

    const rawTrace = await this.redis.lrange(`vsp:${tenantId}:sip:trace:${platformUuid}`, 0, 199);
    for (const line of rawTrace) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const method = String(parsed.method ?? 'UNKNOWN').toUpperCase();
        if (methodFilter && method !== methodFilter.toUpperCase()) continue;
        messages.push({
          ts: String(parsed.ts ?? new Date().toISOString()),
          method,
          direction: String(parsed.direction ?? 'unknown'),
          from: String(parsed.from ?? '—'),
          to: String(parsed.to ?? '—'),
          source: String(parsed.source ?? 'kamailio'),
          detail: parsed.detail as Record<string, unknown> | undefined,
        });
      } catch {
        /* skip */
      }
    }

    messages.sort((a, b) => a.ts.localeCompare(b.ts));

    return {
      platformUuid,
      messages,
      ladder: this.toLadderView(messages),
    };
  }

  private looksLikeSip(span: TraceSpan): boolean {
    return SIP_METHODS.some((m) => span.operation.toUpperCase().includes(m));
  }

  private spanToSipMessage(span: TraceSpan) {
    const method = SIP_METHODS.find((m) => span.operation.toUpperCase().includes(m)) ?? span.operation.toUpperCase();
    return {
      ts: span.ts,
      method,
      direction: span.detail?.direction ? String(span.detail.direction) : 'internal',
      from: String(span.detail?.from ?? span.component),
      to: String(span.detail?.to ?? '—'),
      source: span.component,
      status: span.status,
      detail: span.detail,
    };
  }

  private toLadderView(messages: Array<{ ts: string; method: string; from: string; to: string; direction: string }>) {
    const participants = [...new Set(messages.flatMap((m) => [m.from, m.to]))].filter(Boolean);
    return { participants, steps: messages.map((m, i) => ({ step: i + 1, ...m })) };
  }
}
