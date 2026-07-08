import { Injectable } from '@nestjs/common';
import { QueueStatus, IvrStatus, ConferenceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelecomRedisService } from '../redis/telecom-redis.service';

export type CallAppTarget =
  | { kind: 'QUEUE'; id: string; code: string; tenantId: string }
  | { kind: 'IVR'; id: string; code: string; tenantId: string }
  | { kind: 'CONFERENCE'; id: string; code: string; tenantId: string };

/** Phase 13 — resolve dial codes and DNIS overlays to Queue/IVR/Conference. */
@Injectable()
export class CallAppsResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async resolveByCode(code: string, tenantId?: string): Promise<CallAppTarget | null> {
    const normalized = code.replace(/\D/g, '').length ? code : code.toLowerCase();
    const tenantFilter = tenantId ? { tenantId } : {};

    const queue = await this.prisma.queue.findFirst({
      where: { code: normalized, deletedAt: null, status: QueueStatus.ACTIVE, ...tenantFilter },
    });
    if (queue) return { kind: 'QUEUE', id: queue.id, code: queue.code, tenantId: queue.tenantId };

    const ivr = await this.prisma.iVR.findFirst({
      where: { code: normalized, deletedAt: null, status: IvrStatus.ACTIVE, ...tenantFilter },
    });
    if (ivr) return { kind: 'IVR', id: ivr.id, code: ivr.code, tenantId: ivr.tenantId };

    const conf = await this.prisma.conference.findFirst({
      where: {
        code: normalized,
        deletedAt: null,
        status: { in: [ConferenceStatus.ACTIVE, ConferenceStatus.LOCKED] },
        ...tenantFilter,
      },
    });
    if (conf) return { kind: 'CONFERENCE', id: conf.id, code: conf.code, tenantId: conf.tenantId };

    return null;
  }

  async resolveDnisOverlay(phoneNumberId: string): Promise<CallAppTarget | null> {
    const raw = await this.redis.get(this.redis.dnisRouteKey(phoneNumberId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { kind: CallAppTarget['kind']; id: string; code: string; tenantId: string };
      return parsed as CallAppTarget;
    } catch {
      return null;
    }
  }
}
