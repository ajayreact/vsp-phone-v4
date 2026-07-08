import { Injectable } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import type { RouteActionDto } from '../../telecom/dto/telecom.response.dto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { RegistrationContactBinding } from '../../telecom/events/registration.events';

/** Phase 14 — build FORK/SERIAL actions from Line IDs (multi-device). */
@Injectable()
export class LineForkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async buildForkActions(params: {
    tenantId: string;
    lineIds: string[];
    strategy?: 'FORK' | 'SERIAL';
    hints?: Record<string, string>;
  }): Promise<RouteActionDto[]> {
    const actions: RouteActionDto[] = [];
    const strategy = params.strategy ?? 'FORK';
    let priority = 0;

    for (const lineId of params.lineIds) {
      const line = await this.prisma.line.findFirst({
        where: { id: lineId, tenantId: params.tenantId, deletedAt: null },
        include: {
          devices: { include: { sipEndpoint: true }, where: { deletedAt: null } },
        },
      });
      if (!line) continue;

      const sorted = line.devices.map((d, idx) => ({ device: d, priority: idx + 1 }));
      for (const { device } of sorted) {
        if (
          device.status !== DeviceStatus.REGISTERED &&
          device.status !== DeviceStatus.ONLINE &&
          device.status !== DeviceStatus.BUSY
        ) {
          continue;
        }
        const aor = device.sipEndpoint?.aor;
        if (!aor) continue;
        const contacts = await this.activeContacts(params.tenantId, aor);
        for (const c of contacts) {
          actions.push({
            type: strategy,
            target: c.contact,
            priority: priority++,
            deviceId: device.id,
            lineId,
            hints: params.hints,
          });
        }
      }
    }
    return actions;
  }

  private async activeContacts(
    tenantId: string,
    aor: string,
  ): Promise<RegistrationContactBinding[]> {
    const all = await this.redis.hgetall(this.redis.registrationKey(tenantId, aor));
    const now = Date.now();
    const out: RegistrationContactBinding[] = [];
    for (const raw of Object.values(all)) {
      try {
        const b = JSON.parse(raw) as RegistrationContactBinding;
        if (new Date(b.expiresAt).getTime() > now) out.push(b);
      } catch {
        /* skip */
      }
    }
    return out;
  }
}
