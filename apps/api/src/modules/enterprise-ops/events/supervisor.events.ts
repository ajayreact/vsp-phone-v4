export const SUPERVISOR_EVENTS = {
  MONITOR_STARTED: 'supervisor.monitor_started',
  WHISPER_STARTED: 'supervisor.whisper_started',
  BARGE_STARTED: 'supervisor.barge_started',
  SESSION_ENDED: 'supervisor.session_ended',
} as const;

export type SupervisorMode = 'monitor' | 'whisper' | 'barge';

export interface SupervisorEventPayload {
  eventId: string;
  type: (typeof SUPERVISOR_EVENTS)[keyof typeof SUPERVISOR_EVENTS];
  tenantId: string;
  platformUuid: string;
  targetPlatformUuid: string;
  callSessionId: string;
  supervisorLineId?: string;
  mode: SupervisorMode;
  ts: string;
}
