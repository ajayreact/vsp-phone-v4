export const IVR_EVENTS = {
  STARTED: 'ivr.started',
  DIGIT: 'ivr.digit',
  TIMEOUT: 'ivr.timeout',
  PROMPT_PLAYED: 'ivr.prompt_played',
  COMPLETED: 'ivr.completed',
} as const;

export type IvrEventName = (typeof IVR_EVENTS)[keyof typeof IVR_EVENTS];

export interface IvrEventPayload {
  eventId: string;
  type: IvrEventName;
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  ivrId: string;
  digit?: string;
  menuId?: string;
  destinationType?: string;
  ts: string;
}
