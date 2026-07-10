import { Injectable } from '@nestjs/common';
import { CallLifecycleState, DeviceStatus, PresenceStatus, SIPEndpointStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

const ACTIVE_STATES: CallLifecycleState[] = [
  CallLifecycleState.DIALING,
  CallLifecycleState.RINGING,
  CallLifecycleState.ANSWERED,
  CallLifecycleState.ACTIVE,
  CallLifecycleState.HOLD,
  CallLifecycleState.TRANSFER,
];

@Injectable()
export class SupervisorAgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async listAgents(tenantId: string) {
    const members = await this.prisma.queueMember.findMany({
      where: { tenantId, deletedAt: null, status: 'ACTIVE' },
      include: {
        queue: { select: { id: true, name: true, code: true } },
        line: {
          include: {
            user: { include: { profile: true } },
            presence: true,
            extension: true,
            devices: {
              where: { deletedAt: null },
              take: 1,
              include: { sipEndpoint: true },
            },
            callerId: { include: { phoneNumber: true } },
          },
        },
      },
      take: 500,
    });

    const activeCalls = await this.prisma.callSession.findMany({
      where: { tenantId, deletedAt: null, state: { in: ACTIVE_STATES } },
      include: {
        fromLine: { include: { callerId: { include: { phoneNumber: true } } } },
        phoneNumber: true,
      },
    });

    const callByLine = new Map<string, (typeof activeCalls)[number]>();
    for (const c of activeCalls) {
      if (c.fromLineId) callByLine.set(c.fromLineId, c);
      if (c.toLineId) callByLine.set(c.toLineId, c);
    }

    const seen = new Set<string>();
    const agents: Array<Record<string, unknown>> = [];

    for (const m of members) {
      if (seen.has(m.lineId)) continue;
      seen.add(m.lineId);

      const line = m.line;
      const device = line.devices[0];
      const sip = device?.sipEndpoint;
      const presence = line.presence?.status ?? PresenceStatus.OFFLINE;
      const pauseRaw = await this.redis.get(`vsp:${tenantId}:supervisor:agent:${m.lineId}`);
      let pauseReason: string | null = null;
      let paused = false;
      if (pauseRaw) {
        try {
          const parsed = JSON.parse(pauseRaw) as { reason?: string; pausedAt?: string };
          pauseReason = parsed.reason ?? 'Supervisor pause';
          paused = true;
        } catch {
          paused = true;
        }
      }

      const currentCall = callByLine.get(m.lineId);
      let callDurationSec = 0;
      let callerNumber: string | null = null;
      if (currentCall) {
        const start = currentCall.answeredAt ?? currentCall.startedAt ?? currentCall.createdAt;
        callDurationSec = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
        callerNumber =
          currentCall.fromLine?.callerId?.phoneNumber?.number ??
          currentCall.phoneNumber?.number ??
          null;
      }

      const runtimeRaw = currentCall
        ? await this.redis.get(this.redis.callRuntimeKey(tenantId, currentCall.platformUuid))
        : null;
      let networkQuality = '—';
      if (runtimeRaw) {
        try {
          const rt = JSON.parse(runtimeRaw) as { mos?: number };
          networkQuality = typeof rt.mos === 'number' ? `MOS ${rt.mos.toFixed(1)}` : 'Good';
        } catch {
          networkQuality = 'Good';
        }
      }

      agents.push({
        lineId: m.lineId,
        agentName: line.user?.profile?.displayName ?? line.name,
        extension: line.extension?.extension ?? null,
        queueId: m.queue.id,
        queueName: m.queue.name,
        status: paused ? 'PAUSED' : presence,
        presence,
        currentCallPlatformUuid: currentCall?.platformUuid ?? null,
        callDurationSec,
        callerNumber,
        customerName: line.user?.profile?.displayName ?? null,
        lastActivity: line.presence?.updatedAt?.toISOString() ?? sip?.lastRegisteredAt?.toISOString() ?? null,
        loginTime: sip?.lastRegisteredAt?.toISOString() ?? null,
        pauseReason,
        device: device?.name ?? null,
        networkQuality,
        registration:
          sip?.registrationStatus === SIPEndpointStatus.REGISTERED ||
          device?.status === DeviceStatus.ONLINE
            ? 'online'
            : 'offline',
      });
    }

    return agents;
  }
}
