import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Timeout guidance (ms) for Kamailio HTTP client — documented on each contract. */
export const TELECOM_TIMEOUTS_MS = {
  authenticate: 2000,
  register: 2000,
  unregister: 2000,
  route: 2000,
  callStart: 5000,
  callUpdate: 2000,
  callEnd: 5000,
  presence: 2000,
  device: 2000,
  health: 1000,
  mediaLifecycle: 2000,
  recordingLifecycle: 2000,
  recordingIntent: 2000,
  routingContinue: 2000,
  blfSubscribe: 2000,
  presenceSubscribe: 2000,
} as const;

export class AuthenticateRequestDto {
  @ApiProperty({ example: 'sip:1001@tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  aor!: string;

  @ApiProperty({ example: '1001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  username!: string;

  @ApiProperty({ example: 'tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  realm!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nonce!: string;

  @ApiProperty({ description: 'SIP digest response hash' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  response!: string;

  @ApiProperty({ example: 'REGISTER' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  method!: string;

  @ApiProperty({ example: 'sip:tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  uri!: string;

  @ApiPropertyOptional({ example: '203.0.113.10' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  srcIp?: string;

  /** Kamailio http_connect_raw cannot set custom headers — token may arrive in JSON body. */
  @ApiPropertyOptional({ description: 'Service auth token (Kamailio http_connect_raw path)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  serviceAuth?: string;
}

export class RegisterRequestDto {
  @ApiProperty({ example: 'sip:1001@tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  aor!: string;

  @ApiProperty({ description: 'Contact URI from REGISTER' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  contact!: string;

  @ApiProperty({ example: 3600 })
  @IsInt()
  @Min(0)
  @Max(86400)
  expires!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  srcIp?: string;

  @ApiPropertyOptional({ description: 'Device id when known from prior auth' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  tenantId?: string;

  /** Kamailio http_connect_raw cannot set custom headers — token may arrive in JSON body. */
  @ApiPropertyOptional({ description: 'Service auth token (Kamailio http_connect_raw path)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  serviceAuth?: string;
}

export class UnregisterRequestDto {
  @ApiProperty({ example: 'sip:1001@tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  aor!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  contact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  tenantId?: string;

  /** Kamailio http_connect_raw cannot set custom headers — token may arrive in JSON body. */
  @ApiPropertyOptional({ description: 'Service auth token (Kamailio http_connect_raw path)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  serviceAuth?: string;
}

export class RouteRequestDto {
  @ApiPropertyOptional({ description: 'Caller Address of Record' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  callerAor?: string;

  @ApiProperty({ example: 'sip:1002@tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  requestUri!: string;

  @ApiProperty({ description: 'SIP Call-ID (telecom plane only — not persisted to Prisma)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  callId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  to!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  from!: string;

  @ApiPropertyOptional({ description: 'Dialed Number Identification Service' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  dnis?: string;

  @ApiPropertyOptional({ description: 'Calling Line Identity' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cli?: string;

  @ApiPropertyOptional({
    description: 'SIP digest/auth username when Authorization present (Kamailio $au); else From user',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  authUsername?: string;

  @ApiPropertyOptional({ enum: ['INTERNAL', 'INBOUND', 'OUTBOUND', 'UNKNOWN'] })
  @IsOptional()
  @IsIn(['INTERNAL', 'INBOUND', 'OUTBOUND', 'UNKNOWN'])
  intentHint?: 'INTERNAL' | 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  /** Kamailio http_connect_raw cannot set custom headers — token may arrive in JSON body. */
  @ApiPropertyOptional({ description: 'Service auth token (Kamailio http_connect_raw path)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  serviceAuth?: string;

  @ApiPropertyOptional({ description: 'Signaling source IP (Kamailio $si) for registration binding match' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  srcIp?: string;

  @ApiPropertyOptional({ description: 'Signaling source port (Kamailio $sp)' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  sourcePort?: string;

  @ApiPropertyOptional({ description: 'SIP User-Agent header from desk endpoint' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}

export class CallStartRequestDto {
  @ApiProperty({ description: 'Business correlator — required once allocated' })
  @IsUUID()
  platformUuid!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: ['INTERNAL', 'INBOUND', 'OUTBOUND'] })
  @IsOptional()
  @IsIn(['INTERNAL', 'INBOUND', 'OUTBOUND'])
  callIntent?: 'INTERNAL' | 'INBOUND' | 'OUTBOUND';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  callId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  srcIp?: string;
}

export class CallUpdateRequestDto {
  @ApiProperty()
  @IsUUID()
  platformUuid!: string;

  @ApiProperty({
    description: 'Lifecycle update reason',
    enum: ['RINGING', 'ANSWERED', 'HOLD', 'RESUME', 'TRANSFER', 'REINVITE', 'CUSTOM'],
  })
  @IsIn(['RINGING', 'ANSWERED', 'HOLD', 'RESUME', 'TRANSFER', 'REINVITE', 'CUSTOM'])
  state!: 'RINGING' | 'ANSWERED' | 'HOLD' | 'RESUME' | 'TRANSFER' | 'REINVITE' | 'CUSTOM';

  @ApiPropertyOptional({ description: 'Monotonic sequence for idempotent updates' })
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  detail?: string;
}

export class CallEndRequestDto {
  @ApiProperty()
  @IsUUID()
  platformUuid!: string;

  @ApiPropertyOptional({ example: 'NORMAL_CLEARING' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cause?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  seq?: number;
}

/** Phase 9 — Kamailio → NestJS RTPengine lifecycle (Redis correlation only). */
export class MediaLifecycleRequestDto {
  @ApiProperty({ description: 'Business correlator (ADR-019)' })
  @IsUUID()
  platformUuid!: string;

  @ApiProperty({ enum: ['offer', 'answer', 'delete'] })
  @IsIn(['offer', 'answer', 'delete'])
  event!: 'offer' | 'answer' | 'delete';

  @ApiProperty({ description: 'SIP Call-ID — RTPengine session key in Phase 9' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sipCallId!: string;

  @ApiPropertyOptional({ description: 'Explicit RTPengine session id when distinct from sipCallId' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rtpSessionId?: string;
}

export class WebrtcEnrollRequestDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'WEBRTC device; default = user primary WEBRTC device' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class WebrtcEnrollRevokeRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId!: string;
}

export class PresenceRequestDto {
  @ApiProperty({ example: 'sip:1001@tenant.example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  aor!: string;

  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'AWAY', 'BUSY', 'UNKNOWN'] })
  @IsIn(['OPEN', 'CLOSED', 'AWAY', 'BUSY', 'UNKNOWN'])
  status!: 'OPEN' | 'CLOSED' | 'AWAY' | 'BUSY' | 'UNKNOWN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}

export class DeviceRequestDto {
  @ApiProperty({
    description: 'Device lifecycle / signal from Kamailio edge',
    enum: ['HEARTBEAT', 'ONLINE', 'OFFLINE', 'TLS_FINGERPRINT', 'USER_AGENT'],
  })
  @IsIn(['HEARTBEAT', 'ONLINE', 'OFFLINE', 'TLS_FINGERPRINT', 'USER_AGENT'])
  action!: 'HEARTBEAT' | 'ONLINE' | 'OFFLINE' | 'TLS_FINGERPRINT' | 'USER_AGENT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  aor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  tlsFingerprint?: string;
}

export class BlfSubscribeRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  watcherDeviceId!: string;

  @ApiProperty({ type: [String], description: 'Line IDs to watch for lamp state' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  watchedLineIds!: string[];
}

export class PresenceSubscribeRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subscriberDeviceId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  lineIds!: string[];
}

export class RoutingContinueRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  platformUuid!: string;

  @ApiProperty({
    example: 'ivr_digit',
    description: 'queue_timeout | queue_overflow | ivr_digit | ivr_timeout | conference_leave | conference_moderate',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  reason!: string;

  @ApiPropertyOptional({ description: 'DTMF digit for IVR navigation' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  digit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentDeviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lineId?: string;

  @ApiPropertyOptional({ enum: ['mute', 'unmute', 'lock'] })
  @IsOptional()
  @IsIn(['mute', 'unmute', 'lock'])
  action?: 'mute' | 'unmute' | 'lock';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  seq?: number;

  @ApiPropertyOptional({ description: 'Park slot number (Phase 14)' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  parkSlot?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Supervised call platformUuid (Phase 14)' })
  @IsOptional()
  @IsUUID()
  targetPlatformUuid?: string;

  @ApiPropertyOptional({ enum: ['monitor', 'whisper', 'barge'] })
  @IsOptional()
  @IsIn(['monitor', 'whisper', 'barge'])
  supervisorMode?: 'monitor' | 'whisper' | 'barge';

  @ApiPropertyOptional({ format: 'uuid', description: 'Tenant scope for park retrieve' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class TelecomAcceptedMetaDto {
  @ApiProperty({ description: 'Always true for Phase 5 placeholder contracts' })
  @IsBoolean()
  placeholder!: boolean;

  @ApiProperty({ description: 'Recommended client timeout (ms)' })
  @IsInt()
  timeoutGuidanceMs!: number;

  @ApiPropertyOptional({ description: 'Echo of Idempotency-Key when provided' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
