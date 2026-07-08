export const PRESENCE_NOTIFY_EVENTS = {
  SUBSCRIPTION_CREATED: 'presence.subscription_created',
  NOTIFICATION: 'presence.notification',
} as const;

export interface PresenceNotificationPayload {
  eventId: string;
  type: typeof PRESENCE_NOTIFY_EVENTS.NOTIFICATION;
  tenantId: string;
  lineId: string;
  deviceId?: string;
  status: string;
  channel: string;
  ts: string;
}
