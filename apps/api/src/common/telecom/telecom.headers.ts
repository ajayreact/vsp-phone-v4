/** Shared HTTP header names for telecom ↔ NestJS (ADR-013 / ADR-019). */

export const TELECOM_HEADERS = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  PLATFORM_UUID: 'x-vsp-platform-uuid',
  IDEMPOTENCY_KEY: 'idempotency-key',
  SERVICE_AUTH: 'x-vsp-service-auth',
  SIP_CALL_ID: 'x-sip-call-id',
} as const;

export type TelecomHeaderName =
  (typeof TELECOM_HEADERS)[keyof typeof TELECOM_HEADERS];
