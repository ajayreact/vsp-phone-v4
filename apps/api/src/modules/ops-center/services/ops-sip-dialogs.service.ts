import { Injectable } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { LiveCallsAdminService } from '../../carrier-admin/services/live-calls-admin.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { KamailioRpcClient } from '../clients/kamailio-rpc.client';

const ACTIVE: CallLifecycleState[] = [
  CallLifecycleState.DIALING,
  CallLifecycleState.RINGING,
  CallLifecycleState.ANSWERED,
  CallLifecycleState.ACTIVE,
  CallLifecycleState.HOLD,
  CallLifecycleState.PARK,
  CallLifecycleState.TRANSFER,
];

@Injectable()
export class OpsSipDialogsService {
  constructor(
    private readonly liveCalls: LiveCallsAdminService,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly kamailio: KamailioRpcClient,
  ) {}

  async listActive(params: { tenantId?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 200, 500);
    const [calls, kamailioDialogs] = await Promise.all([
      this.liveCalls.listActive({ tenantId: params.tenantId, limit }),
      this.fetchKamailioDialogs(),
    ]);

    const sessions = await this.prisma.callSession.findMany({
      where: {
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        deletedAt: null,
        state: { in: ACTIVE },
      },
      include: {
        queue: { select: { name: true } },
        fromLine: { include: { user: { include: { profile: true } }, extension: true } },
        tenant: { select: { name: true } },
        recordings: { where: { deletedAt: null }, take: 1 },
      },
      take: limit,
    });

    const sessionByUuid = new Map(sessions.map((s) => [s.platformUuid, s]));

    return calls.map((c) => {
      const session = sessionByUuid.get(c.platformUuid);
      const dlg = kamailioDialogs.get(c.platformUuid) ?? kamailioDialogs.get(session?.sipCallId ?? '');

      return {
        callId: session?.sipCallId ?? c.platformUuid,
        platformUuid: c.platformUuid,
        from: c.caller,
        to: c.callee,
        route: dlg?.route ?? c.trunk,
        state: c.status,
        codec: c.codec,
        durationSec: c.durationSec,
        direction: c.direction,
        carrier: c.trunk,
        tenant: c.tenantName,
        queue: session?.queue?.name ?? null,
        agent: session?.fromLine?.user?.profile?.displayName ?? c.extension,
        transferStatus: session?.state === 'TRANSFER' ? 'transferring' : 'none',
        recordingStatus: session?.recordings.length ? 'recording' : c.recording ? 'on' : 'off',
        mos: c.mos,
        jitterMs: c.jitterMs,
        packetLossPct: c.packetLossPct,
      };
    });
  }

  private async fetchKamailioDialogs(): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    if (!this.kamailio.isConfigured()) return map;
    const res = await this.kamailio.tryCall('dlg.list', []);
    if (!res.ok) return map;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const obj = node as Record<string, unknown>;
      const callid = obj.callid ?? obj['Call-ID'];
      if (typeof callid === 'string') {
        map.set(callid, {
          route: obj.route_set ?? obj.route,
          state: obj.state,
        });
      }
      Object.values(obj).forEach(walk);
    };
    walk(res.result);
    return map;
  }
}
