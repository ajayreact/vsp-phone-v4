export const CONFERENCE_EVENTS = {
  JOINED: 'conference.joined',
  LEFT: 'conference.left',
  MUTED: 'conference.muted',
  UNMUTED: 'conference.unmuted',
  LOCKED: 'conference.locked',
  RECORDING_HOOK: 'conference.recording_hook',
} as const;

export type ConferenceEventName = (typeof CONFERENCE_EVENTS)[keyof typeof CONFERENCE_EVENTS];

export interface ConferenceEventPayload {
  eventId: string;
  type: ConferenceEventName;
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  conferenceId: string;
  lineId?: string;
  deviceId?: string;
  ts: string;
}
