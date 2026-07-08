export const CALL_EVENTS = {
  CREATED: 'call.created',
  RINGING: 'call.ringing',
  ANSWERED: 'call.answered',
  ENDED: 'call.ended',
  REJECTED: 'call.rejected',
} as const;

export type CallEventName = (typeof CALL_EVENTS)[keyof typeof CALL_EVENTS];

export interface CallCreatedPayload {
  eventId: string;
  type: typeof CALL_EVENTS.CREATED;
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  callIntent: string;
  fromLineId?: string;
  toLineId?: string;
  forkCount: number;
  ts: string;
}

export interface CallLifecyclePayload {
  eventId: string;
  type:
    | typeof CALL_EVENTS.RINGING
    | typeof CALL_EVENTS.ANSWERED
    | typeof CALL_EVENTS.ENDED
    | typeof CALL_EVENTS.REJECTED;
  tenantId: string;
  platformUuid: string;
  callSessionId?: string;
  state?: string;
  cause?: string;
  ts: string;
}
