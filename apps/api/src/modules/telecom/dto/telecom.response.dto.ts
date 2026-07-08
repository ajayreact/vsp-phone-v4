import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TelecomHealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'telecom' })
  service!: string;

  @ApiProperty({ example: 'phase5-contract' })
  mode!: string;

  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ description: 'Recommended client timeout (ms)', example: 1000 })
  timeoutGuidanceMs!: number;
}

export class AuthenticateResponseDto {
  @ApiProperty()
  allow!: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  tenantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  deviceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  lineId?: string;

  @ApiPropertyOptional({ example: 3600 })
  expiresSec?: number;

  @ApiProperty({ description: 'Phase 5: true until auth service is implemented' })
  placeholder!: boolean;

  @ApiProperty({ example: 2000 })
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Echo or allocate when known' })
  platformUuid?: string;
}

export class RegisterResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  deviceId?: string;

  @ApiPropertyOptional({ example: 3600 })
  expiresSec?: number;

  @ApiProperty()
  placeholder!: boolean;

  @ApiProperty({ example: 2000 })
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  platformUuid?: string;
}

export class UnregisterResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty()
  placeholder!: boolean;

  @ApiProperty({ example: 2000 })
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  platformUuid?: string;
}

export class RouteActionDto {
  @ApiProperty({
    enum: ['FORK', 'SERIAL', 'BRIDGE_CARRIER', 'APP_MEDIA', 'VOICEMAIL', 'REJECT'],
  })
  type!: 'FORK' | 'SERIAL' | 'BRIDGE_CARRIER' | 'APP_MEDIA' | 'VOICEMAIL' | 'REJECT';

  @ApiPropertyOptional({
    description: 'Contact URI or reject reason code for Kamailio',
  })
  target?: string;

  @ApiPropertyOptional()
  priority?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  deviceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  lineId?: string;

  @ApiPropertyOptional({ description: 'SIP status for REJECT (e.g. 486, 480, 404, 403)' })
  rejectCode?: number;

  @ApiPropertyOptional()
  rejectReason?: string;

  @ApiPropertyOptional({ description: 'SIP header hints for Kamailio (Phase 14 paging/intercom/SLA)' })
  hints?: Record<string, string>;
}

export class RouteRecordingDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ enum: ['both', 'caller', 'callee'] })
  direction?: 'both' | 'caller' | 'callee';

  @ApiProperty()
  pauseAllowed!: boolean;
}

export class RouteRtpDto {
  @ApiPropertyOptional({ description: 'Future rtpengine flags string' })
  flags?: string;
}

export class RouteTimersDto {
  @ApiProperty()
  noAnswerSec!: number;

  @ApiProperty()
  queueRingSec!: number;

  @ApiProperty()
  ivrTimeoutSec!: number;
}

export class RouteResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Business correlator (ADR-019). Allocated on resolve and persisted on CallSession.',
  })
  platformUuid!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  tenantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Persisted CallSession id when created' })
  callSessionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  fromLineId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  toLineId?: string;

  @ApiProperty({ enum: ['INTERNAL', 'INBOUND', 'OUTBOUND', 'UNKNOWN', 'DEFERRED'] })
  callIntent!: 'INTERNAL' | 'INBOUND' | 'OUTBOUND' | 'UNKNOWN' | 'DEFERRED';

  @ApiProperty({ type: [RouteActionDto] })
  actions!: RouteActionDto[];

  @ApiProperty({ type: RouteRecordingDto })
  recording!: RouteRecordingDto;

  @ApiProperty({ type: RouteRtpDto })
  rtp!: RouteRtpDto;

  @ApiProperty({ type: RouteTimersDto })
  timers!: RouteTimersDto;

  @ApiPropertyOptional({ description: 'Display name / number for caller ID presentation' })
  callerIdName?: string;

  @ApiPropertyOptional()
  callerIdNumber?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Flattened FORK contact URIs for Kamailio branch append',
  })
  forkContacts?: string[];

  @ApiPropertyOptional({
    description: 'Comma-separated contacts for Kamailio s.select parsing',
  })
  forkContactsCsv?: string;

  @ApiPropertyOptional({ description: 'Carrier code for BRIDGE_CARRIER' })
  carrierCode?: string;

  @ApiPropertyOptional({ description: 'Kamailio dispatcher set id' })
  dispatcherSet?: number;

  @ApiPropertyOptional({ description: 'Carrier SIP host for R-URI' })
  carrierSipHost?: string;

  @ApiPropertyOptional()
  carrierSipPort?: number;

  @ApiPropertyOptional({ enum: ['udp', 'tcp', 'tls'] })
  carrierTransport?: 'udp' | 'tcp' | 'tls';

  @ApiPropertyOptional({ description: 'E.164 destination for outbound PSTN' })
  destinationE164?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  phoneNumberId?: string;

  @ApiProperty({ description: 'False once Phase 7 routing is active' })
  placeholder!: boolean;

  @ApiProperty({ example: 2000 })
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;
}

export class CallLifecycleResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty({ format: 'uuid' })
  platformUuid!: string;

  @ApiProperty()
  placeholder!: boolean;

  @ApiProperty()
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  state?: string;
}

export class MediaLifecycleResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty({ format: 'uuid' })
  platformUuid!: string;

  @ApiProperty({ enum: ['offer', 'answer', 'delete'] })
  event!: 'offer' | 'answer' | 'delete';

  @ApiProperty({ description: 'RTPengine session id (SIP Call-ID in Phase 9)' })
  rtpSessionId!: string;

  @ApiProperty({ description: 'False — Phase 9 media correlation is active' })
  placeholder!: boolean;
}

export class WebrtcIceServerDto {
  @ApiProperty({ example: 'stun:stun.l.google.com:19302' })
  urls!: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  credential?: string;
}

export class WebrtcEnrollResponseDto {
  @ApiProperty()
  sipUsername!: string;

  @ApiProperty({ description: 'Short-lived digest secret — memory only on client' })
  sipPassword!: string;

  @ApiProperty({ example: 'sip:1001@tenant.sip.vsp.internal' })
  aor!: string;

  @ApiProperty()
  realm!: string;

  @ApiProperty({ example: 'wss://localhost:8443' })
  wssUrl!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: [WebrtcIceServerDto] })
  iceServers!: WebrtcIceServerDto[];

  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ format: 'uuid' })
  sipEndpointId!: string;

  @ApiProperty({ example: 900 })
  enrollTtlSec!: number;
}

export class WebrtcEnrollRevokeResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ format: 'uuid' })
  deviceId!: string;
}

export class PresenceResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty()
  placeholder!: boolean;

  @ApiProperty({ example: 2000 })
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  platformUuid?: string;
}

export class DeviceResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty()
  placeholder!: boolean;

  @ApiProperty({ example: 2000 })
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  deviceId?: string;

  @ApiPropertyOptional()
  platformUuid?: string;
}
