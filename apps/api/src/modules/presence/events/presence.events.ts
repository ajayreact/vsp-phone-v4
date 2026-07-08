export const PRESENCE_EVENTS = {
  CHANGED: 'presence.changed',
  DEVICE_CHANGED: 'device.presence_changed',
} as const;

export type PresenceEventName = (typeof PRESENCE_EVENTS)[keyof typeof PRESENCE_EVENTS];

export interface PresenceChangedPayload {
  eventId: string;
  type: typeof PRESENCE_EVENTS.CHANGED;
  tenantId: string;
  lineId: string;
  deviceId?: string;
  status: string;
  previousStatus?: string;
  source: 'registration' | 'call' | 'browser' | 'admin' | 'device';
  platformUuid?: string;
  ts: string;
}

export interface DevicePresenceChangedPayload {
  eventId: string;
  type: typeof PRESENCE_EVENTS.DEVICE_CHANGED;
  tenantId: string;
  deviceId: string;
  lineId?: string;
  status: string;
  ts: string;
}
