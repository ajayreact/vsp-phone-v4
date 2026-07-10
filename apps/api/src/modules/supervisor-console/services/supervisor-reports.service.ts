import { Injectable } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';

@Injectable()
export class SupervisorReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReports(tenantId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const sessions = await this.prisma.callSession.findMany({
      where: { tenantId, deletedAt: null, startedAt: { gte: weekStart } },
      include: {
        queue: { select: { id: true, name: true } },
        fromLine: { include: { user: { include: { profile: true } }, extension: true } },
      },
      take: 5000,
    });

    const agentStats = new Map<
      string,
      { agentName: string; handled: number; totalHandleSec: number; missed: number; transfers: number }
    >();
    const queueStats = new Map<
      string,
      { queueName: string; offered: number; answered: number; abandoned: number; totalWaitSec: number; slaMet: number }
    >();

    let totalAnswered = 0;
    let totalAbandoned = 0;
    let totalHandleSec = 0;
    let handleCount = 0;
    let totalWaitSec = 0;
    let waitCount = 0;
    let slaMet = 0;
    let transfers = 0;
    let missed = 0;

    for (const s of sessions) {
      const agentKey = s.fromLineId ?? 'unknown';
      const agentName =
        s.fromLine?.user?.profile?.displayName ??
        s.fromLine?.extension?.extension ??
        'Unknown';

      if (!agentStats.has(agentKey)) {
        agentStats.set(agentKey, { agentName, handled: 0, totalHandleSec: 0, missed: 0, transfers: 0 });
      }
      const agent = agentStats.get(agentKey)!;

      if (s.state === CallLifecycleState.TRANSFER) transfers += 1;

      if (s.queueId && s.queue) {
        if (!queueStats.has(s.queueId)) {
          queueStats.set(s.queueId, {
            queueName: s.queue.name,
            offered: 0,
            answered: 0,
            abandoned: 0,
            totalWaitSec: 0,
            slaMet: 0,
          });
        }
        const q = queueStats.get(s.queueId)!;
        q.offered += 1;
      }

      if (s.answeredAt) {
        totalAnswered += 1;
        agent.handled += 1;
        const waitSec = Math.max(
          0,
          Math.floor((s.answeredAt.getTime() - (s.startedAt?.getTime() ?? s.answeredAt.getTime())) / 1000),
        );
        totalWaitSec += waitSec;
        waitCount += 1;
        if (waitSec <= 20) slaMet += 1;

        if (s.queueId && queueStats.has(s.queueId)) {
          const q = queueStats.get(s.queueId)!;
          q.answered += 1;
          q.totalWaitSec += waitSec;
          if (waitSec <= 20) q.slaMet += 1;
        }

        if (s.endedAt) {
          const handleSec = Math.floor((s.endedAt.getTime() - s.answeredAt.getTime()) / 1000);
          totalHandleSec += handleSec;
          handleCount += 1;
          agent.totalHandleSec += handleSec;
        }
      } else if (s.state === CallLifecycleState.ENDED) {
        totalAbandoned += 1;
        agent.missed += 1;
        missed += 1;
        if (s.queueId && queueStats.has(s.queueId)) {
          queueStats.get(s.queueId)!.abandoned += 1;
        }
      }
    }

    const agentPerformance = [...agentStats.entries()].map(([lineId, s]) => ({
      lineId,
      agentName: s.agentName,
      callsHandled: s.handled,
      avgHandleTimeSec: s.handled > 0 ? Math.round(s.totalHandleSec / s.handled) : 0,
      missedCalls: s.missed,
      transfers: s.transfers,
    }));

    const queuePerformance = [...queueStats.entries()].map(([queueId, s]) => ({
      queueId,
      queueName: s.queueName,
      offered: s.offered,
      answered: s.answered,
      abandoned: s.abandoned,
      abandonRatePct: s.offered > 0 ? Math.round((s.abandoned / s.offered) * 1000) / 10 : 0,
      avgWaitSec: s.answered > 0 ? Math.round(s.totalWaitSec / s.answered) : 0,
      slaPct: s.answered > 0 ? Math.round((s.slaMet / s.answered) * 1000) / 10 : 100,
      occupancyPct: 0,
    }));

    const offered = sessions.filter((s) => s.queueId).length;
    const fcrPct =
      totalAnswered > 0
        ? Math.round(((totalAnswered - transfers) / totalAnswered) * 1000) / 10
        : 100;

    return {
      summary: {
        slaPct: waitCount > 0 ? Math.round((slaMet / waitCount) * 1000) / 10 : 100,
        avgHandleTimeSec: handleCount > 0 ? Math.round(totalHandleSec / handleCount) : 0,
        avgWaitTimeSec: waitCount > 0 ? Math.round(totalWaitSec / waitCount) : 0,
        abandonRatePct: offered > 0 ? Math.round((totalAbandoned / offered) * 1000) / 10 : 0,
        firstCallResolutionPct: fcrPct,
        missedCalls: missed,
        transfers,
        occupancyPct: 0,
      },
      agentPerformance,
      queuePerformance,
    };
  }
}
