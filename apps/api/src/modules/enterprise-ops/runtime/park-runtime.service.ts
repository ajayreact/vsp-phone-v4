import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallLifecycleState } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { MusicOnHoldService } from '../../call-media/music-on-hold.service';
import type { RouteActionDto, RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { PARK_PICKUP_EVENTS, type ParkEventPayload } from '../events/park-pickup.events';

const PARK_TTL_SEC = 7200;

/** Phase 14 — call park slots (Redis runtime + CallSession.state=PARK). */
@Injectable()
export class ParkRuntimeService {
  private readonly logger = new Logger(ParkRuntimeService.name);
  private readonly slotCount: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly moh: MusicOnHoldService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.slotCount = Number(config.get('PARK_SLOT_COUNT') ?? '20');
  }

  async park(params: {
    platformUuid: string;
    slot?: string;
    parkedByLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call session not found');

    const slot = params.slot ?? (await this.allocateSlot(session.tenantId));
    await this.prisma.callSession.update({
      where: { id: session.id },
      data: { state: CallLifecycleState.PARK },
    });

    await this.redis.setex(
      this.redis.parkSlotKey(session.tenantId, slot),
      PARK_TTL_SEC,
      JSON.stringify({
        platformUuid: params.platformUuid,
        callSessionId: session.id,
        parkedByLineId: params.parkedByLineId,
        parkedAt: new Date().toISOString(),
      }),
    );

    this.emit(PARK_PICKUP_EVENTS.PARKED, {
      tenantId: session.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: session.id,
      slot,
      parkedByLineId: params.parkedByLineId,
    });

    const mohUri = await this.moh.holdUri(session.tenantId);
    const actions: RouteActionDto[] = [
      {
        type: 'APP_MEDIA',
        target: `sip:park@media.vsp.internal?slot=${slot}&moh=${encodeURIComponent(mohUri)}`,
        priority: 0,
      },
    ];

    return this.plan(session, actions, params.meta);
  }

  async retrieve(params: {
    tenantId: string;
    slot: string;
    retrieverLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const raw = await this.redis.get(this.redis.parkSlotKey(params.tenantId, params.slot));
    if (!raw) throw new NotFoundException(`Park slot ${params.slot} empty`);

    const parked = JSON.parse(raw) as { platformUuid: string; callSessionId: string };
    const session = await this.prisma.callSession.findFirst({
      where: { id: parked.callSessionId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Parked call session not found');

    await this.prisma.callSession.update({
      where: { id: session.id },
      data: { state: CallLifecycleState.ACTIVE },
    });
    await this.redis.del(this.redis.parkSlotKey(params.tenantId, params.slot));

    this.emit(PARK_PICKUP_EVENTS.RETRIEVED, {
      tenantId: params.tenantId,
      platformUuid: parked.platformUuid,
      callSessionId: session.id,
      slot: params.slot,
      parkedByLineId: params.retrieverLineId,
    });

    const actions: RouteActionDto[] = [
      {
        type: 'APP_MEDIA',
        target: `sip:park@media.vsp.internal?retrieve=${params.slot}&platformUuid=${parked.platformUuid}`,
        priority: 0,
      },
    ];

    return this.plan(session, actions, params.meta, parked.platformUuid);
  }

  private async allocateSlot(tenantId: string): Promise<string> {
    for (let i = 1; i <= this.slotCount; i++) {
      const slot = String(i).padStart(2, '0');
      const existing = await this.redis.get(this.redis.parkSlotKey(tenantId, slot));
      if (!existing) return slot;
    }
    throw new NotFoundException('No park slots available');
  }

  private plan(
    session: { id: string; tenantId: string; platformUuid: string },
    actions: RouteActionDto[],
    meta: TelecomCallMeta,
    platformUuid?: string,
  ): RouteResponseDto {
    return {
      platformUuid: platformUuid ?? session.platformUuid,
      tenantId: session.tenantId,
      callSessionId: session.id,
      callIntent: 'INTERNAL',
      actions,
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 60, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };
  }

  private emit(
    type: ParkEventPayload['type'],
    params: Omit<ParkEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: ParkEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }
}
