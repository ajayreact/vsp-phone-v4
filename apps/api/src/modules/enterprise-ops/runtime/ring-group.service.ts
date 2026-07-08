import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallLifecycleState, CallType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { RING_HUNT_EVENTS, type RingHuntEventPayload } from '../events/ring-hunt.events';
import { LineForkService } from './line-fork.service';

/** Phase 14 — Ring All groups (Redis-configured line sets). */
@Injectable()
export class RingGroupService {
  private readonly logger = new Logger(RingGroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fork: LineForkService,
    private readonly events: EventEmitter2,
  ) {}

  async offer(params: {
    tenantId: string;
    code: string;
    lineIds: string[];
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

    const actions = await this.fork.buildForkActions({
      tenantId: params.tenantId,
      lineIds: params.lineIds,
      strategy: 'FORK',
    });

    this.emit(RING_HUNT_EVENTS.RING_GROUP_OFFERED, {
      tenantId: params.tenantId,
      platformUuid,
      callSessionId,
      groupCode: params.code,
      strategy: 'RING_ALL',
      memberLineIds: params.lineIds,
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
