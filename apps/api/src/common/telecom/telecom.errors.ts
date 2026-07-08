/**
 * Enterprise telecom API error codes (Phase 5 contracts).
 * Stable strings for Kamailio / clients — do not rename casually.
 */

export enum TelecomErrorCode {
  VALIDATION_FAILED = 'TELECOM_VALIDATION_FAILED',
  UNAUTHORIZED = 'TELECOM_UNAUTHORIZED',
  FORBIDDEN = 'TELECOM_FORBIDDEN',
  NOT_FOUND = 'TELECOM_NOT_FOUND',
  CONFLICT = 'TELECOM_CONFLICT',
  RATE_LIMITED = 'TELECOM_RATE_LIMITED',
  TIMEOUT = 'TELECOM_TIMEOUT',
  FAIL_CLOSED = 'TELECOM_FAIL_CLOSED',
  NOT_IMPLEMENTED = 'TELECOM_NOT_IMPLEMENTED',
  INTERNAL = 'TELECOM_INTERNAL',
}

export interface TelecomErrorBody {
  statusCode: number;
  code: TelecomErrorCode | string;
  message: string;
  requestId?: string;
  correlationId?: string;
  platformUuid?: string;
  timestamp: string;
  details?: unknown;
  timeoutGuidanceMs?: number;
}
