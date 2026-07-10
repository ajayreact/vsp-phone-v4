import { Injectable } from '@nestjs/common';
import { LiveCallsAdminService } from '../../carrier-admin/services/live-calls-admin.service';
import { CallInspectorService } from '../../enterprise-observability/diagnostics/call-inspector.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

@Injectable()
export class SupervisorCallsService {
  constructor(
    private readonly liveCalls: LiveCallsAdminService,
    private readonly inspector: CallInspectorService,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async listLiveCalls(tenantId: string) {
    const rows = await this.liveCalls.listActive({ tenantId, limit: 200 });

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const session = await this.prisma.callSession.findFirst({
          where: { platformUuid: r.platformUuid, tenantId, deletedAt: null },
          include: {
            queue: { select: { name: true } },
            fromLine: { include: { user: { include: { profile: true } } } },
          },
        });

        const runtimeRaw = await this.redis.get(this.redis.callRuntimeKey(tenantId, r.platformUuid));
        let transferStatus = 'none';
        if (runtimeRaw) {
          try {
            const rt = JSON.parse(runtimeRaw) as { transferPending?: boolean };
            if (rt.transferPending) transferStatus = 'pending';
          } catch {
            /* ignore */
          }
        }

        return {
          ...r,
          queueName: session?.queue?.name ?? null,
          agentName: session?.fromLine?.user?.profile?.displayName ?? r.extension,
          transferStatus,
          rtpQuality:
            r.mos != null
              ? r.mos >= 4
                ? 'excellent'
                : r.mos >= 3.5
                  ? 'good'
                  : 'fair'
              : 'unknown',
        };
      }),
    );

    return enriched;
  }

  async getCallTimeline(tenantId: string, platformUuid: string) {
    const detail = await this.inspector.inspectByPlatformUuid(tenantId, platformUuid);
    const events = [
      detail.startedAt ? { ts: detail.startedAt.toISOString(), event: 'incoming', detail: 'Call started' } : null,
      ...detail.routingTimeline,
      detail.answeredAt ? { ts: detail.answeredAt.toISOString(), event: 'answer', detail: 'Call answered' } : null,
      detail.endedAt ? { ts: detail.endedAt.toISOString(), event: 'hangup', detail: 'Call ended' } : null,
    ].filter(Boolean);

    return {
      platformUuid,
      callSessionId: detail.callSessionId,
      state: detail.state,
      recordingStatus: detail.recordingStatus,
      mediaState: detail.mediaState,
      timeline: events,
    };
  }
}
