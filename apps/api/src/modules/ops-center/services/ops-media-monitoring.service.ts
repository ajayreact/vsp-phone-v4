import { Injectable } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

@Injectable()
export class OpsMediaMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async listActiveSessions(params: { tenantId?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 100, 300);
    const activeStates = [
      CallLifecycleState.DIALING,
      CallLifecycleState.RINGING,
      CallLifecycleState.ANSWERED,
      CallLifecycleState.ACTIVE,
      CallLifecycleState.HOLD,
      CallLifecycleState.TRANSFER,
    ];

    const sessions = await this.prisma.callSession.findMany({
      where: {
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        deletedAt: null,
        state: { in: activeStates },
      },
      take: limit,
      select: { id: true, tenantId: true, platformUuid: true, sipCallId: true },
    });

    const results = [];
    for (const s of sessions) {
      const runtimeRaw = await this.redis.get(this.redis.callRuntimeKey(s.tenantId, s.platformUuid));
      const platformRaw = await this.redis.get(this.redis.corrPlatformKey(s.tenantId, s.platformUuid));
      let runtime: Record<string, unknown> = {};
      let platform: Record<string, unknown> = {};
      if (runtimeRaw) {
        try {
          runtime = JSON.parse(runtimeRaw) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }
      if (platformRaw) {
        try {
          platform = JSON.parse(platformRaw) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }

      results.push({
        platformUuid: s.platformUuid,
        callSessionId: s.id,
        sipCallId: s.sipCallId,
        mos: typeof runtime.mos === 'number' ? runtime.mos : null,
        packetLossPct: typeof runtime.packetLossPct === 'number' ? runtime.packetLossPct : null,
        jitterMs: typeof runtime.jitterMs === 'number' ? runtime.jitterMs : null,
        latencyMs: typeof runtime.latencyMs === 'number' ? runtime.latencyMs : null,
        rtcp: runtime.rtcp ?? null,
        codec: runtime.codec ?? null,
        srtp: Boolean(runtime.srtp ?? runtime.srtpEnabled),
        ice: Boolean(runtime.ice),
        dtls: Boolean(runtime.dtls),
        turn: Boolean(runtime.turn),
        stun: Boolean(runtime.stun),
        rtpSessionId: platform.rtpSessionId ?? null,
        mediaAnchored: platform.mediaAnchored ?? false,
        rtpQuality:
          typeof runtime.mos === 'number'
            ? runtime.mos >= 4
              ? 'excellent'
              : runtime.mos >= 3.5
                ? 'good'
                : 'fair'
            : 'unknown',
      });
    }

    return results;
  }

  async listRtpSessions(params: { tenantId?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 100, 500);
    const pattern = params.tenantId ? `vsp:${params.tenantId}:corr:rtp:*` : 'vsp:*:corr:rtp:*';
    const keys = await this.redis.scanKeys(pattern, limit);
    const sessions = [];
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      try {
        sessions.push(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        /* skip */
      }
    }
    return sessions;
  }
}
