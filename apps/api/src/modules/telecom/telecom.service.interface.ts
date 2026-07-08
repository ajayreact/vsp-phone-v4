import type {
  AuthenticateRequestDto,
  CallEndRequestDto,
  CallStartRequestDto,
  CallUpdateRequestDto,
  DeviceRequestDto,
  PresenceRequestDto,
  RegisterRequestDto,
  RouteRequestDto,
  UnregisterRequestDto,
} from './dto/telecom.request.dto';
import type {
  AuthenticateResponseDto,
  CallLifecycleResponseDto,
  DeviceResponseDto,
  PresenceResponseDto,
  RegisterResponseDto,
  RouteResponseDto,
  TelecomHealthResponseDto,
  UnregisterResponseDto,
} from './dto/telecom.response.dto';

/** Optional request metadata from headers / ALS. */
export interface TelecomCallMeta {
  requestId: string;
  correlationId: string;
  platformUuid?: string;
  idempotencyKey?: string;
}

/**
 * Telecom decision-engine service contract (Phase 5).
 * Implementations must not perform Prisma writes in Phase 5.
 */
export interface ITelecomService {
  health(): TelecomHealthResponseDto;
  authenticate(dto: AuthenticateRequestDto, meta: TelecomCallMeta): Promise<AuthenticateResponseDto>;
  register(dto: RegisterRequestDto, meta: TelecomCallMeta): Promise<RegisterResponseDto>;
  unregister(dto: UnregisterRequestDto, meta: TelecomCallMeta): Promise<UnregisterResponseDto>;
  route(dto: RouteRequestDto, meta: TelecomCallMeta): Promise<RouteResponseDto>;
  callStart(dto: CallStartRequestDto, meta: TelecomCallMeta): Promise<CallLifecycleResponseDto>;
  callUpdate(dto: CallUpdateRequestDto, meta: TelecomCallMeta): Promise<CallLifecycleResponseDto>;
  callEnd(dto: CallEndRequestDto, meta: TelecomCallMeta): Promise<CallLifecycleResponseDto>;
  presence(dto: PresenceRequestDto, meta: TelecomCallMeta): Promise<PresenceResponseDto>;
  device(dto: DeviceRequestDto, meta: TelecomCallMeta): Promise<DeviceResponseDto>;
}

export const TELECOM_SERVICE = Symbol('TELECOM_SERVICE');
