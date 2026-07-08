import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { CallLifecycleState } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CALL_EVENTS, type CallLifecyclePayload } from '../../telecom/events/call.events';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { PARK_PICKUP_EVENTS, type PickupEventPayload } from '../events/park-pickup.events';
import { LineForkService } from './line-fork.service';

const PICKUP_TTL_SEC = 120;

/** Phase 14 — directed and group call pickup (Redis ringing index). */
@Injectable()
export class PickupRuntimeService {
  private readonly logger = new Logger(PickupRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly fork: LineForkService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(CALL_EVENTS.RINGING)
  async onRinging(payload: CallLifecyclePayload): Promise<void> {
    if (!this.prisma.connected) return;
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: payload.platformUuid, deletedAt: null },
      select: { toLineId: true, tenantId: true },
    });
    if (!session?.toLineId) return;

    await this.redis.setex(
      this.redis.pickupRingingKey(session.tenantId, session.toLineId),
      PICKUP_TTL_SEC,
      payload.platformUuid,
    );
  }

  @OnEvent(CALL_EVENTS.ANSWERED)
  @OnEvent(CALL_EVENTS.ENDED)
  async onCallEnd(payload: CallLifecyclePayload): Promise<void> {
    if (!this.prisma.connected) return;
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: payload.platformUuid, deletedAt: null },
      select: { toLineId: true, tenantId: true },
    });
    if (session?.toLineId) {
      await this.redis.del(this.redis.pickupRingingKey(session.tenantId, session.toLineId));
    }
  }

  async directedPickup(params: {
    tenantId: string;
    targetExt: string;
    pickerLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const ext = await this.prisma.extension.findFirst({
      where: { tenantId: params.tenantId, extension: params.targetExt, deletedAt: null },
      include: { line: true },
    });
    if (!ext?.lineId) throw new NotFoundException('Extension not found');

    return this.pickupFromLine({
      tenantId: params.tenantId,
      targetLineId: ext.lineId,
      pickupMode: 'directed',
      pickerLineId: params.pickerLineId,
      meta: params.meta,
    });
  }

  async groupPickup(params: {
    tenantId: string;
    groupId?: string;
    pickerLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const groupId = params.groupId ?? 'default';
    const raw = await this.redis.get(this.redis.pickupGroupKey(params.tenantId, groupId));
    const lineIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    if (!lineIds.length) {
      const ringing = await this.prisma.callSession.findFirst({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          state: CallLifecycleState.RINGING,
        },
        orderBy: { startedAt: 'asc' },
      });
      if (!ringing?.toLineId) throw new NotFoundException('No calls to pick up');
      return this.pickupFromLine({
        tenantId: params.tenantId,
        targetLineId: ringing.toLineId,
        pickupMode: 'group',
        pickerLineId: params.pickerLineId,
        meta: params.meta,
      });
    }

    for (const lineId of lineIds) {
      const platformUuid = await this.redis.get(
        this.redis.pickupRingingKey(params.tenantId, lineId),
      );
      if (platformUuid) {
        return this.pickupFromLine({
          tenantId: params.tenantId,
          targetLineId: lineId,
          pickupMode: 'group',
          pickerLineId: params.pickerLineId,
          meta: params.meta,
        });
      }
    }
    throw new NotFoundException('No calls to pick up in group');
  }

  private async pickupFromLine(params: {
    tenantId: string;
    targetLineId: string;
    pickupMode: 'directed' | 'group';
    pickerLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const platformUuid = await this.redis.get(
      this.redis.pickupRingingKey(params.tenantId, params.targetLineId),
    );
    if (!platformUuid) throw new NotFoundException('No ringing call on target line');

    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Ringing session not found');

    this.emit(PARK_PICKUP_EVENTS.PICKUP_OFFERED, {
      tenantId: params.tenantId,
      platformUuid,
      callSessionId: session.id,
      pickupMode: params.pickupMode,
      targetLineId: params.targetLineId,
      pickerLineId: params.pickerLineId,
    });

    const pickerLineId = params.pickerLineId;
    const actions = pickerLineId
      ? await this.fork.buildForkActions({
          tenantId: params.tenantId,
          lineIds: [pickerLineId],
          strategy: 'FORK',
          hints: { 'Call-Info': 'answer-after=0' },
        })
      : [
          {
            type: 'APP_MEDIA' as const,
            target: `sip:pickup@media.vsp.internal?platformUuid=${platformUuid}`,
            priority: 0,
          },
        ];

    this.emit(PARK_PICKUP_EVENTS.PICKUP_ANSWERED, {
      tenantId: params.tenantId,
      platformUuid,
      callSessionId: session.id,
      pickupMode: params.pickupMode,
      targetLineId: params.targetLineId,
      pickerLineId: params.pickerLineId,
    });

    return {
      platformUuid,
      tenantId: params.tenantId,
      callSessionId: session.id,
      callIntent: 'INTERNAL',
      actions,
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };
  }

  private emit(
    type: PickupEventPayload['type'],
    params: Omit<PickupEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: PickupEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }
}
