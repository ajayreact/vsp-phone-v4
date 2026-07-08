import { Injectable, NotFoundException } from '@nestjs/common';
import { ParkRuntimeService } from '../../enterprise-ops/runtime/park-runtime.service';
import { SupervisorMonitorService } from '../../enterprise-ops/runtime/supervisor-monitor.service';
import { QueueRuntimeService } from '../../queue/runtime/queue-runtime.service';
import { IvrRuntimeService } from '../../ivr/runtime/ivr-runtime.service';
import { ConferenceRuntimeService } from '../../conference/runtime/conference-runtime.service';
import type { RouteResponseDto } from '../dto/telecom.response.dto';
import type { TelecomCallMeta } from '../telecom.service.interface';
import type { RoutingContinueRequestDto } from '../dto/telecom.request.dto';
import { CallAppsResolverService } from './call-apps-resolver.service';

/** Phase 13 — initial Route Plan for Queue/IVR/Conference dial targets. */
@Injectable()
export class CallAppsRoutingService {
  constructor(
    private readonly resolver: CallAppsResolverService,
    private readonly queue: QueueRuntimeService,
    private readonly ivr: IvrRuntimeService,
    private readonly conference: ConferenceRuntimeService,
  ) {}

  async resolveAppDestination(params: {
    code: string;
    tenantId?: string;
    fromLineId?: string;
    platformUuid?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto | null> {
    const target = await this.resolver.resolveByCode(params.code, params.tenantId);
    if (!target) return null;

    switch (target.kind) {
      case 'QUEUE': {
        const result = await this.queue.createQueueSession({
          tenantId: target.tenantId,
          queueId: target.id,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      case 'IVR': {
        const result = await this.ivr.createIvrSession({
          tenantId: target.tenantId,
          ivrId: target.id,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      case 'CONFERENCE': {
        const result = await this.conference.createConferenceSession({
          tenantId: target.tenantId,
          conferenceId: target.id,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      default:
        return null;
    }
  }

  async resolveDnisToApp(params: {
    phoneNumberId: string;
    tenantId: string;
    fromLineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto | null> {
    const target = await this.resolver.resolveDnisOverlay(params.phoneNumberId);
    if (!target || target.tenantId !== params.tenantId) return null;
    return this.resolveAppDestination({
      code: target.code,
      tenantId: params.tenantId,
      fromLineId: params.fromLineId,
      meta: params.meta,
    });
  }
}

/** Phase 13 — routing/continue orchestration (ADR-024). */
@Injectable()
export class RoutingContinueService {
  constructor(
    private readonly queue: QueueRuntimeService,
    private readonly ivr: IvrRuntimeService,
    private readonly conference: ConferenceRuntimeService,
    private readonly park: ParkRuntimeService,
    private readonly supervisor: SupervisorMonitorService,
  ) {}

  async continue(dto: RoutingContinueRequestDto, meta: TelecomCallMeta): Promise<RouteResponseDto> {
    const reason = dto.reason;
    if (reason.startsWith('queue_') || reason === 'agent_answered') {
      return this.queue.continue({
        platformUuid: dto.platformUuid,
        reason,
        agentDeviceId: dto.agentDeviceId,
        meta,
      });
    }
    if (reason.startsWith('ivr_') || dto.digit) {
      return this.ivr.continue({
        platformUuid: dto.platformUuid,
        reason,
        digit: dto.digit,
        meta,
      });
    }
    if (reason === 'conference_join') {
      throw new NotFoundException('Use resolve for conference join');
    }
    if (reason === 'conference_leave') {
      await this.conference.leave({
        platformUuid: dto.platformUuid,
        lineId: dto.lineId,
        deviceId: dto.agentDeviceId,
        meta,
      });
      return {
        platformUuid: dto.platformUuid,
        callIntent: 'INTERNAL',
        actions: [],
        recording: { enabled: false, pauseAllowed: false },
        rtp: {},
        timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
        placeholder: false,
        timeoutGuidanceMs: 2000,
        idempotencyKey: meta.idempotencyKey,
      };
    }
    if (reason === 'conference_moderate' && dto.action) {
      await this.conference.moderate({
        platformUuid: dto.platformUuid,
        action: dto.action as 'mute' | 'unmute' | 'lock',
        meta,
      });
      return {
        platformUuid: dto.platformUuid,
        callIntent: 'INTERNAL',
        actions: [],
        recording: { enabled: false, pauseAllowed: false },
        rtp: {},
        timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
        placeholder: false,
        timeoutGuidanceMs: 2000,
        idempotencyKey: meta.idempotencyKey,
      };
    }
    if (reason === 'park_call') {
      return this.park.park({
        platformUuid: dto.platformUuid,
        slot: dto.parkSlot,
        parkedByLineId: dto.lineId,
        meta,
      });
    }
    if (reason === 'park_retrieve' && dto.parkSlot && dto.tenantId) {
      return this.park.retrieve({
        tenantId: dto.tenantId,
        slot: dto.parkSlot,
        retrieverLineId: dto.lineId,
        meta,
      });
    }
    if (reason.startsWith('supervisor_') && dto.supervisorMode) {
      return this.supervisor.join({
        targetPlatformUuid: dto.targetPlatformUuid ?? dto.platformUuid,
        mode: dto.supervisorMode,
        supervisorLineId: dto.lineId,
        meta,
      });
    }
    if (reason === 'supervisor_end') {
      await this.supervisor.end({
        targetPlatformUuid: dto.targetPlatformUuid ?? dto.platformUuid,
        meta,
      });
      return {
        platformUuid: dto.platformUuid,
        callIntent: 'INTERNAL',
        actions: [],
        recording: { enabled: false, pauseAllowed: false },
        rtp: {},
        timers: { noAnswerSec: 30, queueRingSec: 30, ivrTimeoutSec: 10 },
        placeholder: false,
        timeoutGuidanceMs: 2000,
        idempotencyKey: meta.idempotencyKey,
      };
    }
    throw new NotFoundException(`Unknown continue reason: ${reason}`);
  }
}
