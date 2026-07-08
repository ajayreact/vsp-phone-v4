import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallLifecycleState, CallType, PresenceStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PresenceService } from '../../presence/presence.service';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { RING_HUNT_EVENTS, type HuntStrategy, type RingHuntEventPayload } from '../events/ring-hunt.events';
import { LineForkService } from './line-fork.service';

/** Phase 14 — Hunt groups: Round Robin, Longest Idle, Priority. */
@Injectable()
export class HuntGroupService {
  private readonly logger = new Logger(HuntGroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly fork: LineForkService,
    private readonly presence: PresenceService,
    private readonly events: EventEmitter2,
  ) {}

  async offer(params: {
    tenantId: string;
    code: string;
    lineIds: string[];
    strategy: HuntStrategy;
    fromLineId?: string;
    platformUuid?: string;
    meta: TelecomCallMeta;
  }): Promise<{ platformUuid: string; callSessionId: string; plan: RouteResponseDto }> {
    const platformUuid = params.platformUuid || randomUUID();
    const callSessionId = randomUUID();
    const publicId = `cs_${callSessionId.replace(/-/g, '').slice(0, 16)}`;

    await this.prisma.callSession.create({
      data: {
        id: callSessionId,
        publicId,
        platformUuid,
        tenantId: params.tenantId,
        fromLineId: params.fromLineId ?? null,
        callType: CallType.INTERNAL,
        state: CallLifecycleState.DIALING,
        startedAt: new Date(),
      },
    });

    const selected = await this.selectMembers(params.tenantId, params.code, params.lineIds, params.strategy);
    const forkStrategy = params.strategy === 'RING_ALL' ? 'FORK' : 'SERIAL';
    const actions = await this.fork.buildForkActions({
      tenantId: params.tenantId,
      lineIds: selected,
      strategy: forkStrategy,
    });

    this.emit(RING_HUNT_EVENTS.HUNT_GROUP_OFFERED, {
      tenantId: params.tenantId,
      platformUuid,
      callSessionId,
      groupCode: params.code,
      strategy: params.strategy,
      memberLineIds: selected,
    });

    const plan: RouteResponseDto = {
      platformUuid,
      tenantId: params.tenantId,
      callSessionId,
      fromLineId: params.fromLineId,
      callIntent: 'INTERNAL',
      actions,
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };

    return { platformUuid, callSessionId, plan };
  }

  private async selectMembers(
    tenantId: string,
    code: string,
    lineIds: string[],
    strategy: HuntStrategy,
  ): Promise<string[]> {
    const available: string[] = [];
    for (const lineId of lineIds) {
      const p = await this.presence.getLinePresence(tenantId, lineId);
      const status = (p as { status?: PresenceStatus } | null)?.status;
      if (status === PresenceStatus.OFFLINE || status === PresenceStatus.DND || status === PresenceStatus.ON_CALL) {
        continue;
      }
      available.push(lineId);
    }
    if (!available.length) return lineIds.slice(0, 1);

    switch (strategy) {
      case 'RING_ALL':
        return available;
      case 'LONGEST_IDLE': {
        const idleKey = this.redis.huntIdleKey(tenantId, code);
        const idleMap = await this.redis.hgetall(idleKey);
        const sorted = [...available].sort((a, b) => {
          const ta = Number(idleMap[a] ?? '0');
          const tb = Number(idleMap[b] ?? '0');
          return ta - tb;
        });
        return sorted.slice(0, 1);
      }
      case 'ROUND_ROBIN': {
        const rrKey = this.redis.huntRoundRobinKey(tenantId, code);
        const last = Number((await this.redis.get(rrKey)) ?? '0');
        const idx = last % available.length;
        await this.redis.setex(rrKey, 86_400, String(last + 1));
        return [available[idx]!];
      }
      case 'PRIORITY':
      default:
        return available.slice(0, 1);
    }
  }

  private emit(
    type: RingHuntEventPayload['type'],
    params: Omit<RingHuntEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: RingHuntEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }
}
