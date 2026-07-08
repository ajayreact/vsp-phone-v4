import { Injectable, Logger } from '@nestjs/common';
import { TELECOM_TIMEOUTS_MS } from './dto/telecom.request.dto';
import type {
  AuthenticateRequestDto,
  CallEndRequestDto,
  CallStartRequestDto,
  CallUpdateRequestDto,
  DeviceRequestDto,
  MediaLifecycleRequestDto,
  PresenceRequestDto,
  RegisterRequestDto,
  RouteRequestDto,
  RoutingContinueRequestDto,
  BlfSubscribeRequestDto,
  PresenceSubscribeRequestDto,
  UnregisterRequestDto,
} from './dto/telecom.request.dto';
import type {
  AuthenticateResponseDto,
  CallLifecycleResponseDto,
  DeviceResponseDto,
  MediaLifecycleResponseDto,
  PresenceResponseDto,
  RegisterResponseDto,
  RouteResponseDto,
  TelecomHealthResponseDto,
  UnregisterResponseDto,
} from './dto/telecom.response.dto';
import type { ITelecomService, TelecomCallMeta } from './telecom.service.interface';
import { SipDigestAuthService } from './auth/sip-digest-auth.service';
import { RegistrationService } from './registration/registration.service';
import { RoutingService } from './routing/routing.service';
import { RoutingContinueService } from './routing/routing-continue.service';
import { BlfSubscriptionService } from '../enterprise-ops/runtime/blf-subscription.service';
import { PresenceNotificationService } from '../enterprise-ops/runtime/device-state-sync.service';
import { MediaLifecycleService } from './media/media-lifecycle.service';
import { RecordingLifecycleService } from '../recording/lifecycle/recording-lifecycle.service';
import { TelecomPresenceService } from '../presence/telecom-presence.service';
import {
  RecordingIntentRequestDto,
  RecordingLifecycleRequestDto,
} from '../recording/dto/recording.request.dto';
import type {
  RecordingIntentResponseDto,
  RecordingLifecycleResponseDto,
} from '../recording/dto/recording.response.dto';

/**
 * Telecom facade — Phase 6 auth/reg + Phase 7 routing + Phase 9 media lifecycle.
 */
@Injectable()
export class TelecomService implements ITelecomService {
  private readonly logger = new Logger(TelecomService.name);

  constructor(
    private readonly sipDigest: SipDigestAuthService,
    private readonly registration: RegistrationService,
    private readonly routing: RoutingService,
    private readonly callAppsContinue: RoutingContinueService,
    private readonly blf: BlfSubscriptionService,
    private readonly presenceNotify: PresenceNotificationService,
    private readonly media: MediaLifecycleService,
    private readonly recording: RecordingLifecycleService,
    private readonly telecomPresence: TelecomPresenceService,
  ) {}

  health(): TelecomHealthResponseDto {
    return {
      status: 'ok',
      service: 'telecom',
      mode: 'remediation-complete',
      timestamp: new Date().toISOString(),
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.health,
    };
  }

  async authenticate(
    dto: AuthenticateRequestDto,
    meta: TelecomCallMeta,
  ): Promise<AuthenticateResponseDto> {
    this.logOp('authenticate', meta, { username: dto.username, realm: dto.realm });
    return this.sipDigest.authenticate(dto, meta);
  }

  async register(
    dto: RegisterRequestDto,
    meta: TelecomCallMeta,
  ): Promise<RegisterResponseDto> {
    this.logOp('register', meta, { aor: dto.aor, expires: dto.expires });
    return this.registration.register(dto, meta);
  }

  async unregister(
    dto: UnregisterRequestDto,
    meta: TelecomCallMeta,
  ): Promise<UnregisterResponseDto> {
    this.logOp('unregister', meta, { aor: dto.aor });
    return this.registration.unregister(dto, meta);
  }

  async route(dto: RouteRequestDto, meta: TelecomCallMeta): Promise<RouteResponseDto> {
    this.logOp('route', meta, { callId: dto.callId, requestUri: dto.requestUri });
    return this.routing.resolve(dto, meta);
  }

  async routingContinue(
    dto: RoutingContinueRequestDto,
    meta: TelecomCallMeta,
  ): Promise<RouteResponseDto> {
    this.logOp('routingContinue', meta, { platformUuid: dto.platformUuid, reason: dto.reason });
    return this.callAppsContinue.continue(dto, meta);
  }

  async blfSubscribe(
    dto: BlfSubscribeRequestDto,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; subscribed: string[] }> {
    this.logOp('blfSubscribe', meta, { watcherDeviceId: dto.watcherDeviceId });
    const result = await this.blf.subscribe({
      tenantId: dto.tenantId,
      watcherDeviceId: dto.watcherDeviceId,
      watchedLineIds: dto.watchedLineIds,
    });
    return { accepted: true, subscribed: result.subscribed };
  }

  async presenceSubscribe(
    dto: PresenceSubscribeRequestDto,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; channels: string[] }> {
    this.logOp('presenceSubscribe', meta, { subscriberDeviceId: dto.subscriberDeviceId });
    const result = await this.presenceNotify.subscribe({
      tenantId: dto.tenantId,
      subscriberDeviceId: dto.subscriberDeviceId,
      lineIds: dto.lineIds,
    });
    return { accepted: true, channels: result.channels };
  }

  async callStart(
    dto: CallStartRequestDto,
    meta: TelecomCallMeta,
  ): Promise<CallLifecycleResponseDto> {
    this.logOp('callStart', meta, { platformUuid: dto.platformUuid });
    await this.routing.onCallUpdate(dto.platformUuid, 'RINGING', meta);
    return {
      accepted: true,
      platformUuid: dto.platformUuid,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.callStart,
      idempotencyKey: meta.idempotencyKey,
      state: 'RINGING',
    };
  }

  async callUpdate(
    dto: CallUpdateRequestDto,
    meta: TelecomCallMeta,
  ): Promise<CallLifecycleResponseDto> {
    this.logOp('callUpdate', meta, {
      platformUuid: dto.platformUuid,
      state: dto.state,
      seq: dto.seq,
    });
    await this.routing.onCallUpdate(dto.platformUuid, dto.state, meta);
    return {
      accepted: true,
      platformUuid: dto.platformUuid,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.callUpdate,
      idempotencyKey: meta.idempotencyKey,
      state: dto.state,
    };
  }

  async callEnd(
    dto: CallEndRequestDto,
    meta: TelecomCallMeta,
  ): Promise<CallLifecycleResponseDto> {
    this.logOp('callEnd', meta, {
      platformUuid: dto.platformUuid,
      cause: dto.cause,
      seq: dto.seq,
    });
    await this.routing.onCallEnd(dto.platformUuid, dto.cause, meta);
    return {
      accepted: true,
      platformUuid: dto.platformUuid,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.callEnd,
      idempotencyKey: meta.idempotencyKey,
      state: 'ENDED',
    };
  }

  async mediaLifecycle(
    dto: MediaLifecycleRequestDto,
    meta: TelecomCallMeta,
  ): Promise<MediaLifecycleResponseDto> {
    this.logOp('mediaLifecycle', meta, {
      platformUuid: dto.platformUuid,
      event: dto.event,
      sipCallId: dto.sipCallId,
    });
    return this.media.record(dto, meta);
  }

  async recordingLifecycle(
    dto: RecordingLifecycleRequestDto,
    meta: TelecomCallMeta,
  ): Promise<RecordingLifecycleResponseDto> {
    this.logOp('recordingLifecycle', meta, {
      platformUuid: dto.platformUuid,
      event: dto.event,
    });
    return this.recording.handleLifecycle(dto, meta);
  }

  async recordingIntent(
    dto: RecordingIntentRequestDto,
    meta: TelecomCallMeta,
  ): Promise<RecordingIntentResponseDto> {
    this.logOp('recordingIntent', meta, {
      platformUuid: dto.platformUuid,
      action: dto.action,
    });
    return this.recording.handleIntent(dto);
  }

  async presence(
    dto: PresenceRequestDto,
    meta: TelecomCallMeta,
  ): Promise<PresenceResponseDto> {
    this.logOp('presence', meta, { aor: dto.aor, status: dto.status });
    await this.telecomPresence.updateFromTelecom(dto);
    return {
      accepted: true,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.presence,
      idempotencyKey: meta.idempotencyKey,
      platformUuid: meta.platformUuid,
    };
  }

  async device(dto: DeviceRequestDto, meta: TelecomCallMeta): Promise<DeviceResponseDto> {
    this.logOp('device', meta, { action: dto.action, deviceId: dto.deviceId });
    return {
      accepted: true,
      placeholder: true,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.device,
      idempotencyKey: meta.idempotencyKey,
      deviceId: dto.deviceId,
      platformUuid: meta.platformUuid,
    };
  }

  private logOp(op: string, meta: TelecomCallMeta, extra: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event: `telecom.service.${op}`,
        requestId: meta.requestId,
        correlationId: meta.correlationId,
        platformUuid: meta.platformUuid ?? extra.platformUuid,
        idempotencyKey: meta.idempotencyKey,
        ...extra,
      }),
    );
  }
}
