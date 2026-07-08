export const RING_HUNT_EVENTS = {
  RING_GROUP_OFFERED: 'ring_group.offered',
  HUNT_GROUP_OFFERED: 'hunt_group.offered',
} as const;

export type HuntStrategy = 'RING_ALL' | 'ROUND_ROBIN' | 'LONGEST_IDLE' | 'PRIORITY';

export interface RingHuntEventPayload {
  eventId: string;
  type: (typeof RING_HUNT_EVENTS)[keyof typeof RING_HUNT_EVENTS];
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  groupCode: string;
  strategy: string;
  memberLineIds: string[];
  ts: string;
}
