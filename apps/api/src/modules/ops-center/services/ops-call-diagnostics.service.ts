import { Injectable, NotFoundException } from '@nestjs/common';
import { CallInspectorService } from '../../enterprise-observability/diagnostics/call-inspector.service';
import { CallTraceService } from '../../enterprise-observability/tracing/call-trace.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { OpsMediaMonitoringService } from './ops-media-monitoring.service';
import { OpsSipTraceService } from './ops-sip-trace.service';

@Injectable()
export class OpsCallDiagnosticsService {
  constructor(
    private readonly inspector: CallInspectorService,
    private readonly trace: CallTraceService,
    private readonly media: OpsMediaMonitoringService,
    private readonly sipTrace: OpsSipTraceService,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async diagnose(tenantId: string, platformUuid: string) {
    const session = await this.prisma.callSession.findFirst({
      where: { tenantId, platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call not found');

    const [timeline, trace, sip, mediaSessions] = await Promise.all([
      this.inspector.inspectByPlatformUuid(tenantId, platformUuid),
      this.trace.getTrace(tenantId, platformUuid),
      this.sipTrace.search({ tenantId, platformUuid }),
      this.media.listActiveSessions({ tenantId, limit: 500 }),
    ]);

    const media = mediaSessions.find((m) => m.platformUuid === platformUuid) ?? null;
    const logsRaw = await this.redis.lrange(`vsp:${tenantId}:logs:call:${platformUuid}`, 0, 99);

    return {
      platformUuid,
      callSessionId: session.id,
      timeline: {
        startedAt: timeline.startedAt,
        answeredAt: timeline.answeredAt,
        endedAt: timeline.endedAt,
        routingTimeline: timeline.routingTimeline,
        state: timeline.state,
        disposition: timeline.disposition,
      },
      sip: sip,
      media,
      events: trace,
      logs: logsRaw.map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return { raw: l };
        }
      }),
      rtcp: media?.rtcp ?? null,
      packetStats: {
        packetLossPct: media?.packetLossPct,
        jitterMs: media?.jitterMs,
        mos: media?.mos,
      },
      recordingStatus: timeline.recordingStatus,
    };
  }
}
