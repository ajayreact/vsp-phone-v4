import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CallLifecycleState,
  CallType,
  ConferenceParticipantStatus,
  ConferenceStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PromptManagementService } from '../../call-media/prompt-management.service';
import type { RouteActionDto, RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { RecordingLifecycleService } from '../../recording/lifecycle/recording-lifecycle.service';
import { RecordingPolicyService } from '../../recording/policy/recording-policy.service';
import { CONFERENCE_EVENTS, type ConferenceEventPayload } from '../events/conference.events';

const CORR_TTL_SEC = 7200;

/** Phase 13 — conference join/leave/moderation hooks + recording integration. */
@Injectable()
export class ConferenceRuntimeService {
  private readonly logger = new Logger(ConferenceRuntimeService.name);
  private readonly mediaUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly prompts: PromptManagementService,
    private readonly recordingPolicy: RecordingPolicyService,
    private readonly recordingLifecycle: RecordingLifecycleService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.mediaUri = config.get<string>('CONFERENCE_MEDIA_URI') || 'sip:conf@media.vsp.internal';
  }

  async createConferenceSession(params: {
    tenantId: string;
    conferenceId: string;
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
        conferenceId: params.conferenceId,
        callType: CallType.CONFERENCE,
        state: CallLifecycleState.DIALING,
        startedAt: new Date(),
      },
    });
    const plan = await this.join({
      tenantId: params.tenantId,
      conferenceId: params.conferenceId,
      platformUuid,
      callSessionId,
      fromLineId: params.fromLineId,
      meta: params.meta,
    });
    return { platformUuid, callSessionId, plan };
  }

  async join(params: {
    tenantId: string;
    conferenceId: string;
    platformUuid: string;
    callSessionId: string;
    fromLineId?: string;
    lineId?: string;
    deviceId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const conf = await this.requireActiveConference(params.conferenceId, params.tenantId);
    const participantId = randomUUID();
    await this.prisma.conferenceParticipant.create({
      data: {
        id: participantId,
        publicId: `cp_${participantId.replace(/-/g, '').slice(0, 12)}`,
        tenantId: params.tenantId,
        conferenceId: params.conferenceId,
        lineId: params.lineId ?? params.fromLineId ?? null,
        status: ConferenceParticipantStatus.JOINED,
        joinedAt: new Date(),
      },
    });

    await this.redis.setex(
      this.redis.conferenceLiveKey(params.tenantId, params.conferenceId),
      CORR_TTL_SEC,
      JSON.stringify({ platformUuid: params.platformUuid, callSessionId: params.callSessionId }),
    );

    this.emit(CONFERENCE_EVENTS.JOINED, {
      tenantId: params.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: params.callSessionId,
      conferenceId: params.conferenceId,
      lineId: params.lineId ?? params.fromLineId,
      deviceId: params.deviceId,
    });

    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId: params.tenantId,
      callIntent: 'INTERNAL',
    });
    if (recording.enabled) {
      await this.recordingLifecycle.startFromPolicy(params.platformUuid);
      this.emit(CONFERENCE_EVENTS.RECORDING_HOOK, {
        tenantId: params.tenantId,
        platformUuid: params.platformUuid,
        callSessionId: params.callSessionId,
        conferenceId: params.conferenceId,
      });
    }

    const joinPrompt = this.prompts.resolve('conf_join')?.uri ?? '';
    const actions: RouteActionDto[] = [
      {
        type: 'APP_MEDIA',
        target: `${this.mediaUri}?conf=${conf.code}&pin=${conf.pin ?? ''}&prompt=${encodeURIComponent(joinPrompt)}`,
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
      timers: { noAnswerSec: 60, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };
  }

  async leave(params: {
    platformUuid: string;
    lineId?: string;
    deviceId?: string;
    meta: TelecomCallMeta;
  }): Promise<{ ok: boolean }> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.platformUuid, deletedAt: null },
    });
    if (!session?.conferenceId) throw new NotFoundException('Conference session not found');

    await this.prisma.conferenceParticipant.updateMany({
      where: {
        tenantId: session.tenantId,
        conferenceId: session.conferenceId,
        ...(params.lineId ? { lineId: params.lineId } : {}),
        status: ConferenceParticipantStatus.JOINED,
      },
      data: { status: ConferenceParticipantStatus.LEFT, leftAt: new Date() },
    });

    this.emit(CONFERENCE_EVENTS.LEFT, {
      tenantId: session.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: session.id,
      conferenceId: session.conferenceId,
      lineId: params.lineId,
      deviceId: params.deviceId,
    });

    void params.meta;
    return { ok: true };
  }

  async moderate(params: {
    platformUuid: string;
    action: 'mute' | 'unmute' | 'lock';
    meta: TelecomCallMeta;
  }): Promise<{ ok: boolean }> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.platformUuid, deletedAt: null },
    });
    if (!session?.conferenceId) throw new NotFoundException('Conference session not found');

    if (params.action === 'lock') {
      await this.prisma.conference.update({
        where: { id: session.conferenceId },
        data: { status: ConferenceStatus.LOCKED },
      });
      this.emit(CONFERENCE_EVENTS.LOCKED, {
        tenantId: session.tenantId,
        platformUuid: params.platformUuid,
        callSessionId: session.id,
        conferenceId: session.conferenceId,
      });
    } else {
      const muted = params.action === 'mute';
      await this.prisma.conferenceParticipant.updateMany({
        where: { conferenceId: session.conferenceId, tenantId: session.tenantId, status: ConferenceParticipantStatus.JOINED },
        data: { muted, status: muted ? ConferenceParticipantStatus.MUTED : ConferenceParticipantStatus.JOINED },
      });
      this.emit(muted ? CONFERENCE_EVENTS.MUTED : CONFERENCE_EVENTS.UNMUTED, {
        tenantId: session.tenantId,
        platformUuid: params.platformUuid,
        callSessionId: session.id,
        conferenceId: session.conferenceId,
      });
    }
    void params.meta;
    return { ok: true };
  }

  private async requireActiveConference(conferenceId: string, tenantId: string) {
    const conf = await this.prisma.conference.findFirst({
      where: {
        id: conferenceId,
        tenantId,
        deletedAt: null,
        status: { in: [ConferenceStatus.ACTIVE, ConferenceStatus.LOCKED] },
      },
    });
    if (!conf) throw new NotFoundException('Conference not found or inactive');
    return conf;
  }

  private emit(
    type: ConferenceEventPayload['type'],
    params: Omit<ConferenceEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: ConferenceEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }
}
