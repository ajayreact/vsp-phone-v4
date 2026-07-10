import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallLifecycleState, CallType, QueueStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { MusicOnHoldService } from '../../call-media/music-on-hold.service';
import { PromptManagementService } from '../../call-media/prompt-management.service';
import type { RouteActionDto, RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { RecordingPolicyService } from '../../recording/policy/recording-policy.service';
import {
  QUEUE_DOMAIN_EVENTS,
  QUEUE_EVENTS,
  type QueueEventPayload,
  type QueueJoinedDomainPayload,
} from '../events/queue.events';
import { QueueAgentSelectionService } from './queue-agent-selection.service';

const CORR_TTL_SEC = 7200;

/** Phase 13 — queue runtime: enter, MOH, announcements, agent offer, timeout, overflow. */
@Injectable()
export class QueueRuntimeService {
  private readonly logger = new Logger(QueueRuntimeService.name);
  private readonly waitSec: number;
  private readonly mediaUri: string;
  private readonly retryMax: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly agents: QueueAgentSelectionService,
    private readonly moh: MusicOnHoldService,
    private readonly prompts: PromptManagementService,
    private readonly recordingPolicy: RecordingPolicyService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {
    this.waitSec = Number(config.get('QUEUE_WAIT_SEC') ?? '60');
    this.mediaUri = config.get<string>('QUEUE_MEDIA_URI') || 'sip:queue@media.vsp.internal';
    this.retryMax = Number(config.get('QUEUE_RETRY_MAX') ?? '2');
  }

  async buildEnterPlan(params: {
    tenantId: string;
    queueId: string;
    platformUuid: string;
    callSessionId: string;
    fromLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const queue = await this.requireActiveQueue(params.queueId, params.tenantId);
    const position = await this.incrementQueuePosition(params.tenantId, params.queueId);

    await this.redis.setex(
      this.redis.queueSessionKey(params.tenantId, params.platformUuid),
      CORR_TTL_SEC,
      JSON.stringify({
        queueId: params.queueId,
        callSessionId: params.callSessionId,
        enteredAt: new Date().toISOString(),
        position,
        retries: 0,
      }),
    );

    this.emit(QUEUE_EVENTS.ENTERED, {
      tenantId: params.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: params.callSessionId,
      queueId: params.queueId,
      position,
    });

    const domain: QueueJoinedDomainPayload = {
      platformUuid: params.platformUuid,
      tenantId: params.tenantId,
      queueId: params.queueId,
      callSessionId: params.callSessionId,
      ts: new Date().toISOString(),
    };
    this.events.emit(QUEUE_DOMAIN_EVENTS.JOINED, domain);

    const mohUri = await this.moh.mohUriForQueue(params.tenantId, params.queueId, queue.mohPlaylistId);
    const announcements = await this.prompts.tenantAnnouncementUris(params.tenantId, ['welcome', 'queue_position']);
    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId: params.tenantId,
      toLineId: undefined,
      callIntent: 'INBOUND',
    });

    const actions: RouteActionDto[] = [
      {
        type: 'APP_MEDIA',
        target: `${this.mediaUri}?queue=${queue.code}&moh=${encodeURIComponent(mohUri)}&prompts=${encodeURIComponent(announcements.join(','))}`,
        priority: 0,
      },
    ];

    return {
      platformUuid: params.platformUuid,
      tenantId: params.tenantId,
      callSessionId: params.callSessionId,
      fromLineId: params.fromLineId,
      callIntent: 'INTERNAL',
      actions,
      recording,
      rtp: {},
      timers: {
        noAnswerSec: this.waitSec,
        queueRingSec: this.waitSec,
        ivrTimeoutSec: 10,
      },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };
  }

  async continue(params: {
    platformUuid: string;
    reason: string;
    agentDeviceId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: params.platformUuid, deletedAt: null },
    });
    if (!session?.queueId) {
      throw new NotFoundException('Queue session not found');
    }

    switch (params.reason) {
      case 'queue_timeout':
        return this.handleTimeout(session.tenantId, session.id, session.queueId, params.platformUuid, params.meta);
      case 'queue_overflow':
        return this.handleOverflow(session.tenantId, session.id, session.queueId, params.platformUuid, params.meta);
      case 'queue_agent_answered':
      case 'agent_answered':
        return this.connectAgent(session, params.agentDeviceId, params.meta);
      case 'queue_retry':
        return this.retryOffer(session, params.meta);
      default:
        return this.offerAgents(session, params.meta);
    }
  }

  private async offerAgents(
    session: { tenantId: string; id: string; queueId: string | null; platformUuid: string; fromLineId: string | null },
    meta: TelecomCallMeta,
  ): Promise<RouteResponseDto> {
    const queue = await this.requireActiveQueue(session.queueId!, session.tenantId);
    const selected = await this.agents.selectAgents(queue.id, session.tenantId, queue.strategy);
    if (!selected.length) {
      return this.handleTimeout(session.tenantId, session.id, queue.id, session.platformUuid, meta);
    }

    const actions: RouteActionDto[] = selected.map((a, i) => {
      this.emit(QUEUE_EVENTS.AGENT_OFFERED, {
        tenantId: session.tenantId,
        platformUuid: session.platformUuid,
        callSessionId: session.id,
        queueId: queue.id,
        lineId: a.lineId,
        deviceId: a.deviceId,
      });
      return {
        type: queue.strategy === 'RING_ALL' ? 'FORK' : 'SERIAL',
        target: a.contact,
        priority: i,
        deviceId: a.deviceId,
        lineId: a.lineId,
      };
    });

    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId: session.tenantId,
      fromLineId: session.fromLineId ?? undefined,
      callIntent: 'INTERNAL',
    });

    return {
      platformUuid: session.platformUuid,
      tenantId: session.tenantId,
      callSessionId: session.id,
      callIntent: 'INTERNAL',
      actions,
      recording,
      rtp: {},
      timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };
  }

  private async handleTimeout(
    tenantId: string,
    callSessionId: string,
    queueId: string,
    platformUuid: string,
    meta: TelecomCallMeta,
  ): Promise<RouteResponseDto> {
    this.emit(QUEUE_EVENTS.TIMEOUT, {
      tenantId,
      platformUuid,
      callSessionId,
      queueId,
    });
    const overflow = (this.config.get<string>('QUEUE_OVERFLOW_DEST') || '').trim();
    if (overflow) {
      return this.handleOverflow(tenantId, callSessionId, queueId, platformUuid, meta, overflow);
    }
    return this.retryOffer(
      { tenantId, id: callSessionId, queueId, platformUuid, fromLineId: null },
      meta,
    );
  }

  private async handleOverflow(
    tenantId: string,
    callSessionId: string,
    queueId: string,
    platformUuid: string,
    meta: TelecomCallMeta,
    dest?: string,
  ): Promise<RouteResponseDto> {
    const overflowDest = dest || this.config.get<string>('QUEUE_OVERFLOW_DEST') || 'voicemail';
    this.emit(QUEUE_EVENTS.OVERFLOW, {
      tenantId,
      platformUuid,
      callSessionId,
      queueId,
      overflowDest,
    });

    if (overflowDest.startsWith('queue:')) {
      const targetQueueId = overflowDest.slice('queue:'.length);
      await this.prisma.callSession.update({
        where: { id: callSessionId },
        data: { queueId: targetQueueId },
      });
      return this.buildEnterPlan({
        tenantId,
        queueId: targetQueueId,
        platformUuid,
        callSessionId,
        meta,
      });
    }

    return {
      platformUuid,
      tenantId,
      callSessionId,
      callIntent: 'INTERNAL',
      actions: [{ type: 'VOICEMAIL', target: overflowDest, priority: 0 }],
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };
  }

  private async retryOffer(
    session: { tenantId: string; id: string; queueId: string | null; platformUuid: string; fromLineId: string | null },
    meta: TelecomCallMeta,
  ): Promise<RouteResponseDto> {
    const key = this.redis.queueSessionKey(session.tenantId, session.platformUuid);
    const raw = await this.redis.get(key);
    let retries = 0;
    if (raw) {
      try {
        retries = (JSON.parse(raw) as { retries?: number }).retries ?? 0;
      } catch {
        retries = 0;
      }
    }
    if (retries >= this.retryMax) {
      return this.handleOverflow(session.tenantId, session.id, session.queueId!, session.platformUuid, meta);
    }
    await this.redis.setex(key, CORR_TTL_SEC, JSON.stringify({ queueId: session.queueId, retries: retries + 1 }));
    return this.offerAgents(session, meta);
  }

  private async connectAgent(
    session: { tenantId: string; id: string; platformUuid: string; queueId: string | null },
    agentDeviceId: string | undefined,
    meta: TelecomCallMeta,
  ): Promise<RouteResponseDto> {
    await this.prisma.callSession.update({
      where: { id: session.id },
      data: { state: CallLifecycleState.ANSWERED, answeredAt: new Date() },
    });
    await this.redis.del(this.redis.queueSessionKey(session.tenantId, session.platformUuid));
    return this.offerAgents({ ...session, fromLineId: null }, meta);
  }

  private async requireActiveQueue(queueId: string, tenantId: string) {
    const queue = await this.prisma.queue.findFirst({
      where: { id: queueId, tenantId, deletedAt: null, status: QueueStatus.ACTIVE },
    });
    if (!queue) throw new NotFoundException('Queue not found or inactive');
    return queue;
  }

  private async incrementQueuePosition(tenantId: string, queueId: string): Promise<number> {
    const key = this.redis.queueDepthKey(tenantId, queueId);
    const current = await this.redis.get(key);
    const next = (Number(current ?? '0') || 0) + 1;
    await this.redis.setex(key, CORR_TTL_SEC, String(next));
    return next;
  }

  private emit(type: QueueEventPayload['type'], params: Omit<QueueEventPayload, 'eventId' | 'type' | 'ts'>): void {
    const payload: QueueEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }

  async createQueueSession(params: {
    tenantId: string;
    queueId: string;
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
        queueId: params.queueId,
        callType: CallType.QUEUE,
        state: CallLifecycleState.DIALING,
        startedAt: new Date(),
      },
    });
    const plan = await this.buildEnterPlan({
      tenantId: params.tenantId,
      queueId: params.queueId,
      platformUuid,
      callSessionId,
      fromLineId: params.fromLineId,
      meta: params.meta,
    });
    return { platformUuid, callSessionId, plan };
  }
}
