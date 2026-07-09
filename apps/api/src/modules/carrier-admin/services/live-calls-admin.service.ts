import { Injectable } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

const ACTIVE_STATES: CallLifecycleState[] = [
  CallLifecycleState.DIALING,
  CallLifecycleState.RINGING,
  CallLifecycleState.ANSWERED,
  CallLifecycleState.ACTIVE,
  CallLifecycleState.HOLD,
  CallLifecycleState.PARK,
  CallLifecycleState.TRANSFER,
];

export type LiveCallAdminRecord = {
  id: string;
  platformUuid: string;
  caller: string;
  callee: string;
  tenantId: string;
  tenantName: string;
  extension: string | null;
  trunk: string;
  codec: string;
  mos: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  durationSec: number;
  recording: boolean;
  status: string;
  direction: string;
};

@Injectable()
export class LiveCallsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async listActive(params: { tenantId?: string; limit?: number }): Promise<LiveCallAdminRecord[]> {
    if (!this.prisma.connected) return [];

    const limit = Math.min(params.limit ?? 100, 200);
    const sessions = await this.prisma.callSession.findMany({
      where: {
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        deletedAt: null,
        state: { in: ACTIVE_STATES },
      },
      include: {
        tenant: { select: { name: true } },
        fromLine: { include: { extension: true, callerId: { include: { phoneNumber: true } } } },
        toLine: { include: { extension: true } },
        phoneNumber: true,
        recordings: { where: { deletedAt: null }, take: 1 },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const rows: LiveCallAdminRecord[] = [];
    for (const s of sessions) {
      const runtimeRaw = await this.redis.get(this.redis.callRuntimeKey(s.tenantId, s.platformUuid));
      let runtime: Record<string, unknown> = {};
      if (runtimeRaw) {
        try {
          runtime = JSON.parse(runtimeRaw) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }

      const started = s.startedAt ?? s.createdAt;
      const durationSec = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));
      const fromExt = s.fromLine?.extension?.extension;
      const toExt = s.toLine?.extension?.extension;

      rows.push({
        id: s.id,
        platformUuid: s.platformUuid,
        caller: s.fromLine?.callerId?.phoneNumber?.number ?? fromExt ?? s.sipCallId ?? '—',
        callee: s.phoneNumber?.number ?? toExt ?? '—',
        tenantId: s.tenantId,
        tenantName: s.tenant.name,
        extension: fromExt ?? toExt ?? null,
        trunk: String(runtime.trunk ?? runtime.carrier ?? 'Telnyx'),
        codec: String(runtime.codec ?? '—'),
        mos: typeof runtime.mos === 'number' ? runtime.mos : null,
        jitterMs: typeof runtime.jitterMs === 'number' ? runtime.jitterMs : null,
        packetLossPct: typeof runtime.packetLossPct === 'number' ? runtime.packetLossPct : null,
        durationSec,
        recording: s.recordings.length > 0,
        status: s.state,
        direction: s.callType,
      });
    }
    return rows;
  }
}
