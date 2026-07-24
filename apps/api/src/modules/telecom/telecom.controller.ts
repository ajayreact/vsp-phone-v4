import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { TelecomExceptionFilter } from '../../common/telecom/telecom-exception.filter';
import { TelecomLoggingInterceptor } from '../../common/telecom/telecom-logging.interceptor';
import { TelecomRateLimitGuard } from '../../common/telecom/telecom-rate-limit.guard';
import { TelecomServiceAuthGuard } from '../../common/telecom/telecom-service-auth.guard';
import { TelecomAuthorizationInterceptor } from '../enterprise-security/telecom/telecom-authorization.service';
import { getTelecomContext, type TelecomRequestContext } from '../../common/telecom/telecom.context';
import { TELECOM_HEADERS } from '../../common/telecom/telecom.headers';
import {
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
  TELECOM_TIMEOUTS_MS,
  UnregisterRequestDto,
} from './dto/telecom.request.dto';
import {
  RecordingIntentRequestDto,
  RecordingLifecycleRequestDto,
} from '../recording/dto/recording.request.dto';
import {
  AuthenticateResponseDto,
  CallLifecycleResponseDto,
  DeviceResponseDto,
  MediaLifecycleResponseDto,
  PresenceResponseDto,
  RegisterResponseDto,
  RouteActionDto,
  RouteRecordingDto,
  RouteResponseDto,
  RouteRtpDto,
  RouteTimersDto,
  TelecomHealthResponseDto,
  UnregisterResponseDto,
} from './dto/telecom.response.dto';
import {
  RecordingIntentResponseDto,
  RecordingLifecycleResponseDto,
} from '../recording/dto/recording.response.dto';
import { TelecomService } from './telecom.service';
import type { TelecomCallMeta } from './telecom.service.interface';

@ApiTags('telecom')
@ApiSecurity('telecom-service-auth')
@ApiExtraModels(
  RouteActionDto,
  RouteRecordingDto,
  RouteRtpDto,
  RouteTimersDto,
)
@ApiHeader({
  name: TELECOM_HEADERS.REQUEST_ID,
  required: false,
  description: 'Client request id; generated if omitted',
})
@ApiHeader({
  name: TELECOM_HEADERS.CORRELATION_ID,
  required: false,
  description: 'Cross-service correlation id',
})
@ApiHeader({
  name: TELECOM_HEADERS.PLATFORM_UUID,
  required: false,
  description: 'Business correlator (ADR-019) when already allocated',
})
@ApiHeader({
  name: TELECOM_HEADERS.IDEMPOTENCY_KEY,
  required: false,
  description: 'Idempotency key for safe retries',
})
@ApiHeader({
  name: TELECOM_HEADERS.SERVICE_AUTH,
  required: false,
  description: 'Shared service token (required when TELECOM_SERVICE_AUTH_TOKEN is set)',
})
@Controller('v1/telecom')
@UseGuards(TelecomServiceAuthGuard, TelecomRateLimitGuard)
@UseInterceptors(TelecomLoggingInterceptor, TelecomAuthorizationInterceptor)
@UseFilters(TelecomExceptionFilter)
export class TelecomController {
  constructor(private readonly telecom: TelecomService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Telecom module health',
    description: `Timeout guidance: ${TELECOM_TIMEOUTS_MS.health}ms. No auth DB checks.`,
  })
  @ApiResponse({ status: 200, type: TelecomHealthResponseDto })
  health(): TelecomHealthResponseDto {
    return this.telecom.health();
  }

  @Post('authenticate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'SIP digest authentication (alias)',
    description: `Phase 5 path retained. Prefer POST /auth/sip-digest (ADR-024). Timeout ≤ ${TELECOM_TIMEOUTS_MS.authenticate}ms.`,
  })
  @ApiResponse({ status: 200, type: AuthenticateResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Service auth failed' })
  authenticate(
    @Body() dto: AuthenticateRequestDto,
    @Req() req: Request,
  ): Promise<AuthenticateResponseDto> {
    return this.telecom.authenticate(dto, this.meta(req));
  }

  @Post('auth/sip-digest')
  @HttpCode(200)
  @ApiOperation({
    summary: 'SIP digest authentication (ADR-024)',
    description: `NestJS verifies HA1 from vault. Kamailio HTTP client. Timeout ≤ ${TELECOM_TIMEOUTS_MS.authenticate}ms. Idempotent cache by nonce+user. platformUuid NOT required.`,
  })
  @ApiResponse({ status: 200, type: AuthenticateResponseDto })
  sipDigest(
    @Body() dto: AuthenticateRequestDto,
    @Req() req: Request,
  ): Promise<AuthenticateResponseDto> {
    return this.telecom.authenticate(dto, this.meta(req));
  }

  @Post('register')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Registration accepted — usrloc/Redis sync',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.register}ms. Updates Redis contact set + SIPEndpoint.lastRegisteredAt. Emits registration.created|refreshed. No Contact in Prisma.`,
  })
  @ApiResponse({ status: 200, type: RegisterResponseDto })
  register(@Body() dto: RegisterRequestDto, @Req() req: Request): Promise<RegisterResponseDto> {
    return this.telecom.register(dto, this.meta(req));
  }

  @Post('unregister')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Unregistration — contact removal',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.unregister}ms. Emits registration.unregistered.`,
  })
  @ApiResponse({ status: 200, type: UnregisterResponseDto })
  unregister(
    @Body() dto: UnregisterRequestDto,
    @Req() req: Request,
  ): Promise<UnregisterResponseDto> {
    return this.telecom.unregister(dto, this.meta(req));
  }

  @Post('route')
  @ApiOperation({
    summary: 'Route plan resolve (alias)',
    description: `Prefer POST /routing/resolve (ADR-024). Timeout ≤ ${TELECOM_TIMEOUTS_MS.route}ms.`,
  })
  @ApiResponse({ status: 200, type: RouteResponseDto })
  route(@Body() dto: RouteRequestDto, @Req() req: Request): Promise<RouteResponseDto> {
    return this.telecom.route(dto, this.meta(req));
  }

  @Post('routing/resolve')
  @ApiOperation({
    summary: 'Route plan resolve (ADR-024) — creates CallSession',
    description: `Allocates platformUuid, persists CallSession (no sipCallId), returns FORK contacts. Timeout ≤ ${TELECOM_TIMEOUTS_MS.route}ms. Internal Line→Line only in Phase 7.`,
  })
  @ApiResponse({ status: 200, type: RouteResponseDto })
  routingResolve(
    @Body() dto: RouteRequestDto,
    @Req() req: Request,
  ): Promise<RouteResponseDto> {
    return this.telecom.route(dto, this.meta(req));
  }

  @Post('routing/continue')
  @ApiOperation({
    summary: 'Route plan continue (ADR-024) — queue/IVR/conference mid-call',
    description:
      'Kamailio/media app callbacks for DTMF, queue timeout, agent answer, conference leave. Timeout ≤ ' +
      `${TELECOM_TIMEOUTS_MS.routingContinue}ms.`,
  })
  @ApiResponse({ status: 200, type: RouteResponseDto })
  routingContinue(
    @Body() dto: RoutingContinueRequestDto,
    @Req() req: Request,
  ): Promise<RouteResponseDto> {
    return this.telecom.routingContinue(dto, this.meta(req));
  }

  @Post('blf/subscribe')
  @ApiOperation({
    summary: 'BLF subscription (Phase 14)',
    description: `Register device BLF watches; lamp state via presence. Timeout ≤ ${TELECOM_TIMEOUTS_MS.blfSubscribe}ms.`,
  })
  blfSubscribe(@Body() dto: BlfSubscribeRequestDto, @Req() req: Request) {
    return this.telecom.blfSubscribe(dto, this.meta(req));
  }

  @Post('presence/subscribe')
  @ApiOperation({
    summary: 'Presence subscription (Phase 14)',
    description: `Subscribe device to line presence channels. Timeout ≤ ${TELECOM_TIMEOUTS_MS.presenceSubscribe}ms.`,
  })
  presenceSubscribe(@Body() dto: PresenceSubscribeRequestDto, @Req() req: Request) {
    return this.telecom.presenceSubscribe(dto, this.meta(req));
  }

  @Post('call/start')
  @ApiOperation({
    summary: 'Call start / ringing lifecycle',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.callStart}ms. Updates CallSession → RINGING.`,
  })
  @ApiResponse({ status: 200, type: CallLifecycleResponseDto })
  callStart(
    @Body() dto: CallStartRequestDto,
    @Req() req: Request,
  ): Promise<CallLifecycleResponseDto> {
    return this.telecom.callStart(dto, this.meta(req));
  }

  @Post('call/update')
  @ApiOperation({
    summary: 'Call update lifecycle',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.callUpdate}ms. Idempotent on platformUuid+state+seq.`,
  })
  @ApiResponse({ status: 200, type: CallLifecycleResponseDto })
  callUpdate(
    @Body() dto: CallUpdateRequestDto,
    @Req() req: Request,
  ): Promise<CallLifecycleResponseDto> {
    return this.telecom.callUpdate(dto, this.meta(req));
  }

  @Post('call/end')
  @ApiOperation({
    summary: 'Call end lifecycle',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.callEnd}ms. Sets CallSession ENDED.`,
  })
  @ApiResponse({ status: 200, type: CallLifecycleResponseDto })
  callEnd(@Body() dto: CallEndRequestDto, @Req() req: Request): Promise<CallLifecycleResponseDto> {
    return this.telecom.callEnd(dto, this.meta(req));
  }

  @Post('media/lifecycle')
  @ApiOperation({
    summary: 'RTPengine media lifecycle correlation (Phase 9)',
    description:
      'Kamailio notifies offer/answer/delete. Writes Redis corr:rtp + corr:platform only — no SDP in Prisma. Timeout ≤ ' +
      `${TELECOM_TIMEOUTS_MS.mediaLifecycle}ms.`,
  })
  @ApiResponse({ status: 200, type: MediaLifecycleResponseDto })
  @ApiResponse({ status: 404, description: 'CallSession not found for platformUuid' })
  mediaLifecycle(
    @Body() dto: MediaLifecycleRequestDto,
    @Req() req: Request,
  ): Promise<MediaLifecycleResponseDto> {
    return this.telecom.mediaLifecycle(dto, this.meta(req));
  }

  @Post('recording/lifecycle')
  @ApiOperation({
    summary: 'RTPengine recording lifecycle (Phase 12)',
    description:
      'Kamailio/uploader notifies started/stopped/completed/failed. Metadata in Prisma; media in object storage. Timeout ≤ ' +
      `${TELECOM_TIMEOUTS_MS.recordingLifecycle}ms.`,
  })
  @ApiResponse({ status: 200, type: RecordingLifecycleResponseDto })
  recordingLifecycle(
    @Body() dto: RecordingLifecycleRequestDto,
    @Req() req: Request,
  ): Promise<RecordingLifecycleResponseDto> {
    return this.telecom.recordingLifecycle(dto, this.meta(req));
  }

  @Post('recording/intent')
  @ApiOperation({
    summary: 'Recording pause/resume/stop intent (Phase 12)',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.recordingIntent}ms.`,
  })
  @ApiResponse({ status: 200, type: RecordingIntentResponseDto })
  recordingIntent(
    @Body() dto: RecordingIntentRequestDto,
    @Req() req: Request,
  ): Promise<RecordingIntentResponseDto> {
    return this.telecom.recordingIntent(dto, this.meta(req));
  }

  @Post('presence')
  @ApiOperation({
    summary: 'Presence update (Phase 12)',
    description: `Service-auth presence by AoR. Timeout ≤ ${TELECOM_TIMEOUTS_MS.presence}ms.`,
  })
  @ApiResponse({ status: 200, type: PresenceResponseDto })
  presence(@Body() dto: PresenceRequestDto, @Req() req: Request): Promise<PresenceResponseDto> {
    return this.telecom.presence(dto, this.meta(req));
  }

  @Post('device')
  @ApiOperation({
    summary: 'Device signal (contract)',
    description: `Timeout ≤ ${TELECOM_TIMEOUTS_MS.device}ms. No Device Prisma write in Phase 5.`,
  })
  @ApiResponse({ status: 200, type: DeviceResponseDto })
  device(@Body() dto: DeviceRequestDto, @Req() req: Request): Promise<DeviceResponseDto> {
    return this.telecom.device(dto, this.meta(req));
  }

  private meta(req: Request): TelecomCallMeta {
    const fromAls = getTelecomContext();
    const attached = (req as Request & { telecomContext?: TelecomRequestContext }).telecomContext;
    const ctx = fromAls || attached;
    return {
      requestId: ctx?.requestId || 'unknown',
      correlationId: ctx?.correlationId || ctx?.requestId || 'unknown',
      platformUuid: ctx?.platformUuid,
      idempotencyKey: ctx?.idempotencyKey,
    };
  }
}
