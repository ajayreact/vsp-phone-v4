import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallLifecycleState, CallType, IvrDestinationType, IvrStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PromptManagementService } from '../../call-media/prompt-management.service';
import type { RouteActionDto, RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { RecordingPolicyService } from '../../recording/policy/recording-policy.service';
import { QueueRuntimeService } from '../../queue/runtime/queue-runtime.service';
import { ConferenceRuntimeService } from '../../conference/runtime/conference-runtime.service';
import { VoicemailRuntimeService } from '../../voicemail/runtime/voicemail-runtime.service';
import { IVR_EVENTS, type IvrEventPayload } from '../events/ivr.events';

const CORR_TTL_SEC = 7200;

/** Phase 13 — IVR runtime: prompt playback, DTMF routing, destination handoff. */
@Injectable()
export class IvrRuntimeService {
  private readonly logger = new Logger(IvrRuntimeService.name);
  private readonly mediaUri: string;
  private readonly timeoutSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly prompts: PromptManagementService,
    private readonly recordingPolicy: RecordingPolicyService,
    private readonly queue: QueueRuntimeService,
    private readonly conference: ConferenceRuntimeService,
    private readonly voicemail: VoicemailRuntimeService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.mediaUri = config.get<string>('IVR_MEDIA_URI') || 'sip:ivr@media.vsp.internal';
    this.timeoutSec = Number(config.get('IVR_TIMEOUT_SEC') ?? '10');
  }

  async createIvrSession(params: {
    tenantId: string;
    ivrId: string;
    fromLineId?: string;
    platformUuid?: string;
    meta: TelecomCallMeta;
  }): Promise<{ platformUuid: string; callSessionId: string; plan: RouteResponseDto }> {
    const ivr = await this.requireActiveIvr(params.ivrId, params.tenantId);
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
        ivrId: params.ivrId,
        callType: CallType.IVR,
        state: CallLifecycleState.DIALING,
        startedAt: new Date(),
      },
    });

    await this.redis.setex(
      this.redis.ivrSessionKey(params.tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify({ ivrId: params.ivrId, callSessionId }),
    );

    this.emit(IVR_EVENTS.STARTED, {
      tenantId: params.tenantId,
      platformUuid,
      callSessionId,
      ivrId: params.ivrId,
    });

    const mainPrompt = this.prompts.resolve('ivr_main')?.uri ?? '';
    const plan = await this.buildPromptPlan({
      tenantId: params.tenantId,
      platformUuid,
      callSessionId,
      ivr,
      promptUri: mainPrompt,
      meta: params.meta,
    });
    return { platformUuid, callSessionId, plan };
  }

  async handleDigit(params: {
    platformUuid: string;
    digit: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.platformUuid, deletedAt: null },
    });
    if (!session?.ivrId) throw new NotFoundException('IVR session not found');

    const menu = await this.prisma.iVRMenu.findFirst({
      where: {
        tenantId: session.tenantId,
        ivrId: session.ivrId,
        digit: params.digit,
        deletedAt: null,
      },
    });

    this.emit(IVR_EVENTS.DIGIT, {
      tenantId: session.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: session.id,
      ivrId: session.ivrId,
      digit: params.digit,
      menuId: menu?.id,
      destinationType: menu?.destinationType,
    });

    if (!menu) {
      const invalid = this.prompts.resolve('ivr_invalid')?.uri ?? '';
      return this.buildPromptPlan({
        tenantId: session.tenantId,
        platformUuid: params.platformUuid,
        callSessionId: session.id,
        ivr: { code: 'ivr' },
        promptUri: invalid,
        meta: params.meta,
      });
    }

    return this.routeDestination(session, menu, params.meta);
  }

  async continue(params: {
    platformUuid: string;
    reason: string;
    digit?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    if (params.reason === 'ivr_timeout') {
      const session = await this.prisma.callSession.findFirst({
        where: { platformUuid: params.platformUuid, deletedAt: null },
      });
      if (!session?.ivrId) throw new NotFoundException('IVR session not found');
      this.emit(IVR_EVENTS.TIMEOUT, {
        tenantId: session.tenantId,
        platformUuid: params.platformUuid,
        callSessionId: session.id,
        ivrId: session.ivrId,
      });
      return this.voicemail.buildVoicemailPlan({
        tenantId: session.tenantId,
        platformUuid: params.platformUuid,
        callSessionId: session.id,
        meta: params.meta,
      });
    }
    if (params.digit) {
      return this.handleDigit({ platformUuid: params.platformUuid, digit: params.digit, meta: params.meta });
    }
    throw new NotFoundException('IVR continue requires digit or timeout');
  }

  private async routeDestination(
    session: { tenantId: string; id: string; platformUuid: string; fromLineId: string | null; ivrId: string },
    menu: {
      destinationType: IvrDestinationType;
      destinationLineId: string | null;
      destinationQueueId: string | null;
      destinationConferenceId: string | null;
      destinationVoicemailId: string | null;
    },
    meta: TelecomCallMeta,
  ): Promise<RouteResponseDto> {
    this.emit(IVR_EVENTS.COMPLETED, {
      tenantId: session.tenantId,
      platformUuid: session.platformUuid,
      callSessionId: session.id,
      ivrId: session.ivrId,
      destinationType: menu.destinationType,
    });

    switch (menu.destinationType) {
      case IvrDestinationType.QUEUE:
        if (!menu.destinationQueueId) break;
        await this.prisma.callSession.update({
          where: { id: session.id },
          data: { ivrId: null, queueId: menu.destinationQueueId, callType: CallType.QUEUE },
        });
        return this.queue.buildEnterPlan({
          tenantId: session.tenantId,
          queueId: menu.destinationQueueId,
          platformUuid: session.platformUuid,
          callSessionId: session.id,
          fromLineId: session.fromLineId ?? undefined,
          meta,
        });
      case IvrDestinationType.CONFERENCE:
        if (!menu.destinationConferenceId) break;
        return this.conference.join({
          tenantId: session.tenantId,
          conferenceId: menu.destinationConferenceId,
          platformUuid: session.platformUuid,
          callSessionId: session.id,
          fromLineId: session.fromLineId ?? undefined,
          meta,
        });
      case IvrDestinationType.VOICEMAIL:
        return this.voicemail.buildVoicemailPlan({
          tenantId: session.tenantId,
          platformUuid: session.platformUuid,
          callSessionId: session.id,
          voicemailId: menu.destinationVoicemailId ?? undefined,
          lineId: menu.destinationLineId ?? undefined,
          meta,
        });
      case IvrDestinationType.LINE:
      default:
        if (menu.destinationLineId) {
          await this.prisma.callSession.update({
            where: { id: session.id },
            data: { toLineId: menu.destinationLineId, ivrId: null, callType: CallType.INTERNAL },
          });
        }
        return {
          platformUuid: session.platformUuid,
          tenantId: session.tenantId,
          callSessionId: session.id,
          toLineId: menu.destinationLineId ?? undefined,
          callIntent: 'INTERNAL',
          actions: [{ type: 'FORK', target: `line:${menu.destinationLineId}`, priority: 0, lineId: menu.destinationLineId ?? undefined }],
          recording: { enabled: false, pauseAllowed: false },
          rtp: {},
          timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: this.timeoutSec },
          placeholder: false,
          timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
          idempotencyKey: meta.idempotencyKey,
        };
    }
    return this.voicemail.buildVoicemailPlan({
      tenantId: session.tenantId,
      platformUuid: session.platformUuid,
      callSessionId: session.id,
      meta,
    });
  }

  private async buildPromptPlan(params: {
    tenantId: string;
    platformUuid: string;
    callSessionId: string;
    ivr: { code: string };
    promptUri: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    this.emit(IVR_EVENTS.PROMPT_PLAYED, {
      tenantId: params.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: params.callSessionId,
      ivrId: 'ivr',
    });

    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId: params.tenantId,
      callIntent: 'INBOUND',
    });

    const actions: RouteActionDto[] = [
      {
        type: 'APP_MEDIA',
        target: `${this.mediaUri}?ivr=${params.ivr.code}&prompt=${encodeURIComponent(params.promptUri)}`,
        priority: 0,
      },
    ];

    return {
      platformUuid: params.platformUuid,
      tenantId: params.tenantId,
      callSessionId: params.callSessionId,
      callIntent: 'INTERNAL',
      actions,
      recording,
      rtp: {},
      timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: this.timeoutSec },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };
  }

  private async requireActiveIvr(ivrId: string, tenantId: string) {
    const ivr = await this.prisma.iVR.findFirst({
      where: { id: ivrId, tenantId, deletedAt: null, status: IvrStatus.ACTIVE },
    });
    if (!ivr) throw new NotFoundException('IVR not found or inactive');
    return ivr;
  }

  private emit(type: IvrEventPayload['type'], params: Omit<IvrEventPayload, 'eventId' | 'type' | 'ts'>): void {
    const payload: IvrEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ivrId: params.ivrId,
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }
}
