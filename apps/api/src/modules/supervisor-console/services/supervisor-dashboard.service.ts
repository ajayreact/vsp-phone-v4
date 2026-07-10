import { Injectable } from '@nestjs/common';
import { CallLifecycleState, PresenceStatus, QueueStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

const SLA_THRESHOLD_SEC = 20;
const ACTIVE_STATES: CallLifecycleState[] = [
  CallLifecycleState.DIALING,
  CallLifecycleState.RINGING,
  CallLifecycleState.ANSWERED,
  CallLifecycleState.ACTIVE,
  CallLifecycleState.HOLD,
  CallLifecycleState.PARK,
  CallLifecycleState.TRANSFER,
];

@Injectable()
export class SupervisorDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async getDashboard(tenantId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      activeCalls,
      waitingCalls,
      queueSessions,
      todaySessions,
      presences,
      queueMembers,
      queues,
    ] = await Promise.all([
      this.prisma.callSession.count({
        where: { tenantId, deletedAt: null, state: { in: ACTIVE_STATES } },
      }),
      this.prisma.callSession.count({
        where: { tenantId, deletedAt: null, queueId: { not: null }, state: CallLifecycleState.RINGING },
      }),
      this.prisma.callSession.findMany({
        where: { tenantId, deletedAt: null, queueId: { not: null }, state: { in: ACTIVE_STATES } },
        select: { startedAt: true, answeredAt: true, createdAt: true, state: true },
      }),
      this.prisma.callSession.findMany({
        where: { tenantId, deletedAt: null, startedAt: { gte: todayStart }, queueId: { not: null } },
        select: { startedAt: true, answeredAt: true, endedAt: true, state: true },
      }),
      this.prisma.presence.findMany({ where: { tenantId }, select: { status: true } }),
      this.prisma.queueMember.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.queue.findMany({ where: { tenantId, deletedAt: null, status: QueueStatus.ACTIVE }, select: { id: true } }),
    ]);

    let longestWaitingSec = 0;
    for (const s of queueSessions.filter((x) => x.state === CallLifecycleState.RINGING)) {
      const start = s.startedAt ?? s.createdAt;
      const wait = Math.floor((Date.now() - start.getTime()) / 1000);
      if (wait > longestWaitingSec) longestWaitingSec = wait;
    }

    let answeredToday = 0;
    let abandoned = 0;
    let totalWaitMs = 0;
    let waitCount = 0;
    let totalHandleMs = 0;
    let handleCount = 0;
    let slaMet = 0;
    let slaTotal = 0;

    for (const s of todaySessions) {
      if (s.answeredAt) {
        answeredToday += 1;
        const waitMs = s.answeredAt.getTime() - (s.startedAt?.getTime() ?? s.answeredAt.getTime());
        totalWaitMs += Math.max(0, waitMs);
        waitCount += 1;
        slaTotal += 1;
        if (waitMs / 1000 <= SLA_THRESHOLD_SEC) slaMet += 1;
        if (s.endedAt) {
          totalHandleMs += s.endedAt.getTime() - s.answeredAt.getTime();
          handleCount += 1;
        }
      } else if (s.state === CallLifecycleState.ENDED && !s.answeredAt) {
        abandoned += 1;
        slaTotal += 1;
      }
    }

    const availableAgents = presences.filter((p) => p.status === PresenceStatus.AVAILABLE).length;
    const busyAgents = presences.filter((p) => p.status === PresenceStatus.BUSY || p.status === PresenceStatus.ON_CALL).length;
    const offlineAgents = presences.filter((p) => p.status === PresenceStatus.OFFLINE).length;
    const pausedAgents = await this.countPausedAgents(tenantId);

    let reservedDepth = 0;
    for (const q of queues) {
      const depthRaw = await this.redis.get(this.redis.queueDepthKey(tenantId, q.id));
      reservedDepth += Number(depthRaw ?? 0);
    }

    const waitingTotal = Math.max(waitingCalls, reservedDepth);
    const avgWaitSec = waitCount > 0 ? Math.round(totalWaitMs / waitCount / 1000) : 0;
    const avgHandleSec = handleCount > 0 ? Math.round(totalHandleMs / handleCount / 1000) : 0;
    const slaPct = slaTotal > 0 ? Math.round((slaMet / slaTotal) * 1000) / 10 : 100;
    const occupancy = queueMembers > 0 ? Math.round((busyAgents / queueMembers) * 1000) / 10 : 0;

    return {
      activeCalls,
      waitingCalls: waitingTotal,
      longestWaitingSec,
      answeredToday,
      abandoned,
      slaPct,
      availableAgents,
      busyAgents,
      offlineAgents,
      pausedAgents,
      averageHandleTimeSec: avgHandleSec,
      averageWaitTimeSec: avgWaitSec,
      serviceLevel: slaPct,
      queueOccupancyPct: occupancy,
      agentsLoggedIn: queueMembers,
      ts: new Date().toISOString(),
    };
  }

  async getWallboard(tenantId: string) {
    const dashboard = await this.getDashboard(tenantId);
    const queues = await this.prisma.queue.findMany({
      where: { tenantId, deletedAt: null, status: QueueStatus.ACTIVE },
      select: { id: true, name: true, code: true },
      take: 20,
    });

    const queueTiles = await Promise.all(
      queues.map(async (q) => {
        const depthRaw = await this.redis.get(this.redis.queueDepthKey(tenantId, q.id));
        const waiting = Number(depthRaw ?? 0);
        const agents = await this.prisma.queueMember.count({
          where: { tenantId, queueId: q.id, deletedAt: null, status: 'ACTIVE' },
        });
        const stateRaw = await this.redis.get(`vsp:${tenantId}:supervisor:queue:${q.id}`);
        let operationalState = { paused: false, emergencyClosed: false };
        if (stateRaw) {
          try {
            operationalState = JSON.parse(stateRaw) as typeof operationalState;
          } catch {
            /* ignore */
          }
        }
        return { ...q, waiting, agents, ...operationalState };
      }),
    );

    return { ...dashboard, queues: queueTiles };
  }

  private async countPausedAgents(tenantId: string): Promise<number> {
    const keys = await this.redis.scanKeys(`vsp:${tenantId}:supervisor:agent:*`, 500);
    return keys.length;
  }
}
