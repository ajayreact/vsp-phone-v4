export const BLF_EVENTS = {
  SUBSCRIBED: 'blf.subscribed',
  UNSUBSCRIBED: 'blf.unsubscribed',
  LAMP_CHANGED: 'blf.lamp_changed',
} as const;

export type BlfLampState = 'idle' | 'ringing' | 'busy' | 'dnd' | 'offline';

export interface BlfEventPayload {
  eventId: string;
  type: (typeof BLF_EVENTS)[keyof typeof BLF_EVENTS];
  tenantId: string;
  watcherDeviceId: string;
  watchedLineId: string;
  lampState: BlfLampState;
  platformUuid?: string;
  ts: string;
}
