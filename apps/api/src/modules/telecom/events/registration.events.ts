export const REGISTRATION_EVENTS = {
  CREATED: 'registration.created',
  REFRESHED: 'registration.refreshed',
  EXPIRED: 'registration.expired',
  UNREGISTERED: 'registration.unregistered',
  AUTH_FAILED: 'registration.auth_failed',
} as const;

export type RegistrationEventName =
  (typeof REGISTRATION_EVENTS)[keyof typeof REGISTRATION_EVENTS];

export interface RegistrationContactBinding {
  contact: string;
  expiresAt: string;
  expiresSec: number;
  userAgent?: string;
  srcIp?: string;
  deviceId?: string;
  callId?: string;
  cseq?: number;
}

export interface RegistrationCreatedPayload {
  eventId: string;
  type: typeof REGISTRATION_EVENTS.CREATED | typeof REGISTRATION_EVENTS.REFRESHED;
  tenantId: string;
  deviceId: string;
  sipEndpointId: string;
  lineId?: string;
  aor: string;
  contact: string;
  expiresAt: string;
  userAgent?: string;
  srcIp?: string;
  multiDeviceCount: number;
  ts: string;
}

export interface RegistrationRemovedPayload {
  eventId: string;
  type: typeof REGISTRATION_EVENTS.EXPIRED | typeof REGISTRATION_EVENTS.UNREGISTERED;
  tenantId: string;
  deviceId?: string;
  sipEndpointId?: string;
  aor: string;
  contact?: string;
  reason: string;
  ts: string;
}

export interface RegistrationAuthFailedPayload {
  eventId: string;
  type: typeof REGISTRATION_EVENTS.AUTH_FAILED;
  aor?: string;
  username?: string;
  realm?: string;
  srcIp?: string;
  reason: string;
  ts: string;
}
