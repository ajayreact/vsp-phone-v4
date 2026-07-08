export const PARK_PICKUP_EVENTS = {
  PARKED: 'park.parked',
  RETRIEVED: 'park.retrieved',
  PICKUP_OFFERED: 'pickup.offered',
  PICKUP_ANSWERED: 'pickup.answered',
} as const;

export interface ParkEventPayload {
  eventId: string;
  type: (typeof PARK_PICKUP_EVENTS)[keyof typeof PARK_PICKUP_EVENTS];
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  slot: string;
  parkedByLineId?: string;
  ts: string;
}

export interface PickupEventPayload {
  eventId: string;
  type: (typeof PARK_PICKUP_EVENTS)[keyof typeof PARK_PICKUP_EVENTS];
  tenantId: string;
  platformUuid: string;
  callSessionId: string;
  pickupMode: 'directed' | 'group';
  targetLineId?: string;
  pickerLineId?: string;
  ts: string;
}
