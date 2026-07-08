import { Injectable, NotFoundException } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { CallTraceService } from '../tracing/call-trace.service';

export interface CallDiagnosticTimeline {
  platformUuid: string;
  tenantId: string;
  callSessionId?: string;
  state?: string;
  callType?: string;
  fromLineId?: string | null;
  toLineId?: string | null;
  startedAt?: Date | null;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  trace: Awaited<ReturnType<CallTraceService['getTrace']>>;
  routingTimeline: Array<{ ts: string; event: string; detail?: string }>;
  mediaState?: Record<string, unknown>;
  recordingStatus?: string;
  disposition?: string;
}

/** Phase 15 — Call Inspector (business view; no SIP internals exposed). */
@Injectable()
export class CallInspectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly trace: CallTraceService,
  ) {}

  async inspectByPlatformUuid(tenantId: string, platformUuid: string): Promise<CallDiagnosticTimeline> {
    const session = await this.prisma.callSession.findFirst({
      where: { tenantId, platformUuid, deletedAt: null },
      include: {
        recordings: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!session) throw new NotFoundException('Call session not found');

    const trace = await this.trace.getTrace(tenantId, platformUuid);
    const runtimeRaw = await this.redis.get(this.redis.callRuntimeKey(tenantId, platformUuid));
    let mediaState: Record<string, unknown> | undefined;
    if (runtimeRaw) {
      try {
        mediaState = JSON.parse(runtimeRaw) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }

    const routingTimeline = trace.map((s) => ({
      ts: s.ts,
      event: `${s.component}.${s.operation}`,
      detail: s.status,
    }));

    const rec = session.recordings[0];
    return {
      platformUuid,
      tenantId,
      callSessionId: session.id,
      state: session.state,
      callType: session.callType,
      fromLineId: session.fromLineId,
      toLineId: session.toLineId,
      startedAt: session.startedAt,
      answeredAt: session.answeredAt,
      endedAt: session.endedAt,
      trace,
      routingTimeline,
      mediaState,
      recordingStatus: rec?.status,
      disposition: session.state === CallLifecycleState.ENDED ? 'completed' : session.state.toLowerCase(),
    };
  }

  async search(params: {
    tenantId: string;
    platformUuid?: string;
    extension?: string;
    callerNumber?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<CallDiagnosticTimeline[]> {
    const limit = Math.min(params.limit ?? 20, 100);
    const where: Record<string, unknown> = { tenantId: params.tenantId, deletedAt: null };

    if (params.platformUuid) where.platformUuid = params.platformUuid;
    if (params.from || params.to) {
      where.startedAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }
    if (params.extension) {
      const ext = await this.prisma.extension.findFirst({
        where: { tenantId: params.tenantId, extension: params.extension, deletedAt: null },
      });
      if (ext?.lineId) where.OR = [{ fromLineId: ext.lineId }, { toLineId: ext.lineId }];
    }

    const sessions = await this.prisma.callSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const results: CallDiagnosticTimeline[] = [];
    for (const s of sessions) {
      if (params.callerNumber) {
        /* filter deferred — would join CallerID in future */
      }
      results.push(await this.inspectByPlatformUuid(params.tenantId, s.platformUuid));
    }
    return results;
  }
}
