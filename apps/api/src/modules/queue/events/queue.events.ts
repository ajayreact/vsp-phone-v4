export const QUEUE_EVENTS = {
  ENTERED: 'queue.entered',
  AGENT_OFFERED: 'queue.agent_offered',
  OVERFLOW: 'queue.overflow',
  TIMEOUT: 'queue.timeout',
  ABANDONED: 'queue.abandoned',
  ANNOUNCEMENT: 'queue.announcement',
} as const;

export type QueueEventName = (typeof QUEUE_EVENTS)[keyof typeof QUEUE_EVENTS];

export interface QueueEventPayload {
  eventId: string;
  type: QueueEventName;
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  queueId: string;
  lineId?: string;
  deviceId?: string;
  position?: number;
  overflowDest?: string;
  ts: string;
}

export const QUEUE_DOMAIN_EVENTS = {
  JOINED: 'QueueJoined',
  LEFT: 'QueueLeft',
} as const;

export interface QueueJoinedDomainPayload {
  platformUuid: string;
  tenantId: string;
  queueId: string;
  callSessionId: string;
  ts: string;
}
