export const RECORDING_EVENTS = {
  STARTED: 'recording.started',
  PAUSED: 'recording.paused',
  RESUMED: 'recording.resumed',
  COMPLETED: 'recording.completed',
  FAILED: 'recording.failed',
} as const;

export type RecordingEventName = (typeof RECORDING_EVENTS)[keyof typeof RECORDING_EVENTS];

export interface RecordingEventPayload {
  eventId: string;
  type: RecordingEventName;
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  recordingId: string;
  segmentId: string;
  mediaObjectKey?: string;
  durationSeconds?: number;
  errorCode?: string;
  ts: string;
}

/** ADR-014 domain event emitted after recording.started is applied. */
export const RECORDING_DOMAIN_EVENTS = {
  STARTED: 'RecordingStarted',
} as const;

export interface RecordingStartedDomainPayload {
  recordingId: string;
  platformUuid: string;
  tenantId: string;
  callSessionId: string;
  segmentId: string;
  ts: string;
}
