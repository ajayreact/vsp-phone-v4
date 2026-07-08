import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { RouteActionDto, RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import {
  SUPERVISOR_EVENTS,
  type SupervisorEventPayload,
  type SupervisorMode,
} from '../events/supervisor.events';

const SUPERVISOR_TTL_SEC = 7200;

/** Phase 14 — supervisor monitor, whisper, and barge-in. */
@Injectable()
export class SupervisorMonitorService {
  private readonly logger = new Logger(SupervisorMonitorService.name);
  private readonly mediaUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.mediaUri = config.get<string>('SUPERVISOR_MEDIA_URI') || 'sip:supervisor@media.vsp.internal';
  }

  async join(params: {
    targetPlatformUuid: string;
    mode: SupervisorMode;
    supervisorLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const target = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.targetPlatformUuid, deletedAt: null },
    });
    if (!target) throw new NotFoundException('Target call not found');

    const supervisorPlatformUuid = randomUUID();
    await this.redis.setex(
      this.redis.supervisorSessionKey(target.tenantId, params.targetPlatformUuid),
      SUPERVISOR_TTL_SEC,
      JSON.stringify({
        mode: params.mode,
        supervisorPlatformUuid,
        supervisorLineId: params.supervisorLineId,
        startedAt: new Date().toISOString(),
      }),
    );

    const eventType =
      params.mode === 'monitor'
        ? SUPERVISOR_EVENTS.MONITOR_STARTED
        : params.mode === 'whisper'
          ? SUPERVISOR_EVENTS.WHISPER_STARTED
          : SUPERVISOR_EVENTS.BARGE_STARTED;

    this.emit(eventType, {
      tenantId: target.tenantId,
      platformUuid: supervisorPlatformUuid,
      targetPlatformUuid: params.targetPlatformUuid,
      callSessionId: target.id,
      supervisorLineId: params.supervisorLineId,
      mode: params.mode,
    });

    const actions: RouteActionDto[] = [
      {
        type: 'APP_MEDIA',
        target: `${this.mediaUri}?mode=${params.mode}&target=${params.targetPlatformUuid}`,
        priority: 0,
        lineId: params.supervisorLineId,
        hints: {
          'Call-Info': `purpose=supervisor-${params.mode}`,
        },
      },
    ];

    return {
      platformUuid: supervisorPlatformUuid,
      tenantId: target.tenantId,
      callSessionId: target.id,
      callIntent: 'INTERNAL',
      actions,
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 60, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };
  }

  async end(params: {
    targetPlatformUuid: string;
    meta: TelecomCallMeta;
  }): Promise<{ ok: boolean }> {
    const target = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.targetPlatformUuid, deletedAt: null },
    });
    if (!target) throw new NotFoundException('Target call not found');

    await this.redis.del(this.redis.supervisorSessionKey(target.tenantId, params.targetPlatformUuid));
    this.emit(SUPERVISOR_EVENTS.SESSION_ENDED, {
      tenantId: target.tenantId,
      platformUuid: params.targetPlatformUuid,
      targetPlatformUuid: params.targetPlatformUuid,
      callSessionId: target.id,
      mode: 'monitor',
    });
    void params.meta;
    return { ok: true };
  }

  private emit(
    type: SupervisorEventPayload['type'],
    params: Omit<SupervisorEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: SupervisorEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }
}
