/** Phase 15 — structured telecom log entry schema (ADR-016). */
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'sip_registration'
  | 'inbound_call'
  | 'outbound_call'
  | 'answered'
  | 'rejected'
  | 'busy'
  | 'timeout'
  | 'queue'
  | 'ivr'
  | 'conference'
  | 'recording'
  | 'blf'
  | 'presence'
  | 'park'
  | 'pickup'
  | 'paging'
  | 'intercom'
  | 'supervisor'
  | 'telnyx_webhook'
  | 'provisioning'
  | 'authentication'
  | 'api_request';

export interface StructuredLogEntry {
  timestamp: string;
  event: string;
  category: LogCategory;
  severity: LogSeverity;
  tenantId?: string;
  platformUuid?: string;
  lineId?: string;
  extension?: string;
  userId?: string;
  deviceId?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
  durationMs?: number;
  correlationId?: string;
  requestId?: string;
  detail?: Record<string, unknown>;
}

export interface TraceSpan {
  spanId: string;
  platformUuid: string;
  tenantId: string;
  component: 'kamailio' | 'nestjs' | 'rtpengine' | 'carrier' | 'recording' | 'cdr' | 'analytics' | 'queue' | 'ivr';
  operation: string;
  ts: string;
  durationMs?: number;
  status: 'ok' | 'error';
  detail?: Record<string, unknown>;
}

export interface AuditEntry {
  auditId: string;
  ts: string;
  tenantId: string;
  actorUserId?: string;
  actorType: 'user' | 'admin' | 'system' | 'supervisor';
  action: string;
  resourceType: string;
  resourceId?: string;
  platformUuid?: string;
  immutable: true;
  detail?: Record<string, unknown>;
}
