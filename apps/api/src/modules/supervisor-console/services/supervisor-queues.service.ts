import { Injectable } from '@nestjs/common';
import { CallLifecycleState, QueueStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

@Injectable()
export class SupervisorQueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async listLiveQueues(tenantId: string) {
    const queues = await this.prisma.queue.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        members: { where: { deletedAt: null, status: 'ACTIVE' } },
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const results = [];
    for (const q of queues) {
      const depthRaw = await this.redis.get(this.redis.queueDepthKey(tenantId, q.id));
      const waitingCalls = Number(depthRaw ?? 0);

      const sessions = await this.prisma.callSession.findMany({
        where: {
          tenantId,
          queueId: q.id,
          deletedAt: null,
          startedAt: { gte: todayStart },
        },
        select: { startedAt: true, answeredAt: true, endedAt: true, state: true, createdAt: true },
      });

      let longestWaitSec = 0;
      let totalWaitMs = 0;
      let waitCount = 0;
      let abandoned = 0;
      let answered = 0;
      let slaMet = 0;

      for (const s of sessions) {
        if (s.answeredAt) {
          answered += 1;
          const waitMs = s.answeredAt.getTime() - (s.startedAt?.getTime() ?? s.createdAt.getTime());
          totalWaitMs += Math.max(0, waitMs);
          waitCount += 1;
          if (waitMs / 1000 <= 20) slaMet += 1;
        } else if (s.state === CallLifecycleState.ENDED) {
          abandoned += 1;
        }
        if (s.state === CallLifecycleState.RINGING) {
          const w = Math.floor((Date.now() - (s.startedAt ?? s.createdAt).getTime()) / 1000);
          if (w > longestWaitSec) longestWaitSec = w;
        }
      }

      const stateRaw = await this.redis.get(`vsp:${tenantId}:supervisor:queue:${q.id}`);
      let paused = false;
      let emergencyClosed = false;
      let overflowQueueId: string | null = null;
      if (stateRaw) {
        try {
          const parsed = JSON.parse(stateRaw) as { paused?: boolean; emergencyClosed?: boolean; overflowQueueId?: string };
          paused = Boolean(parsed.paused);
          emergencyClosed = Boolean(parsed.emergencyClosed);
          overflowQueueId = parsed.overflowQueueId ?? null;
        } catch {
          /* ignore */
        }
      }

      const offered = sessions.length;
      results.push({
        id: q.id,
        name: q.name,
        code: q.code,
        strategy: q.strategy,
        status: q.status,
        waitingCalls,
        agentsLoggedIn: q.members.length,
        averageWaitSec: waitCount > 0 ? Math.round(totalWaitMs / waitCount / 1000) : 0,
        longestWaitSec: Math.max(longestWaitSec, waitingCalls > 0 ? longestWaitSec : 0),
        abandonPct: offered > 0 ? Math.round((abandoned / offered) * 1000) / 10 : 0,
        serviceLevelPct: answered > 0 ? Math.round((slaMet / answered) * 1000) / 10 : 100,
        overflow: Boolean(overflowQueueId),
        priority: 0,
        overflowQueueId,
        paused,
        emergencyClosed,
        operational: q.status === QueueStatus.ACTIVE && !emergencyClosed,
      });
    }

    return results;
  }

  async setQueueState(
    tenantId: string,
    queueId: string,
    patch: { paused?: boolean; emergencyClosed?: boolean; overflowQueueId?: string | null },
  ) {
    const existingRaw = await this.redis.get(`vsp:${tenantId}:supervisor:queue:${queueId}`);
    const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : {};
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await this.redis.setex(`vsp:${tenantId}:supervisor:queue:${queueId}`, 86400, JSON.stringify(next));
    return next;
  }
}
