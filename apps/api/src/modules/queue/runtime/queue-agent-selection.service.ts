import { Injectable } from '@nestjs/common';
import { PresenceStatus, QueueMemberStatus, QueueStrategy } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { PresenceService } from '../../presence/presence.service';

export interface QueueAgentCandidate {
  lineId: string;
  deviceId?: string;
  contact?: string;
  priority: number;
}

/** Phase 13 — queue agent ranking per Queue.strategy (ADR-004). */
@Injectable()
export class QueueAgentSelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly presence: PresenceService,
  ) {}

  async selectAgents(queueId: string, tenantId: string, strategy: QueueStrategy): Promise<QueueAgentCandidate[]> {
    const members = await this.prisma.queueMember.findMany({
      where: { queueId, tenantId, deletedAt: null, status: QueueMemberStatus.ACTIVE },
      include: {
        line: {
          include: {
            devices: { include: { sipEndpoint: true }, where: { deletedAt: null } },
          },
        },
      },
      orderBy: { priority: 'asc' },
    });

    const candidates: QueueAgentCandidate[] = [];
    for (const member of members) {
      const linePresence = await this.presence.getLinePresence(tenantId, member.lineId);
      const status = (linePresence as { status?: PresenceStatus } | null)?.status;
      if (status === PresenceStatus.OFFLINE || status === PresenceStatus.DND || status === PresenceStatus.ON_CALL) {
        continue;
      }
      for (const device of member.line.devices) {
        if (!device.sipEndpoint?.aor) continue;
        const regKey = this.redis.registrationKey(tenantId, device.sipEndpoint.aor);
        const contacts = await this.redis.hgetall(regKey);
        const contact = Object.values(contacts)[0];
        if (!contact) continue;
        try {
          const binding = JSON.parse(contact) as { contact?: string };
          candidates.push({
            lineId: member.lineId,
            deviceId: device.id,
            contact: binding.contact,
            priority: member.priority,
          });
        } catch {
          /* skip */
        }
      }
    }

    return this.applyStrategy(candidates, strategy);
  }

  private applyStrategy(candidates: QueueAgentCandidate[], strategy: QueueStrategy): QueueAgentCandidate[] {
    if (!candidates.length) return [];
    switch (strategy) {
      case QueueStrategy.RING_ALL:
        return candidates.sort((a, b) => a.priority - b.priority);
      case QueueStrategy.PRIORITY:
        return candidates.sort((a, b) => a.priority - b.priority).slice(0, 1);
      case QueueStrategy.LONGEST_IDLE:
      case QueueStrategy.LEAST_CALLS:
      case QueueStrategy.ROUND_ROBIN:
      default:
        return candidates.sort((a, b) => a.priority - b.priority).slice(0, 1);
    }
  }
}
