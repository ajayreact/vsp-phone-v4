'use client';

export type DidDestinationType =
  | 'EXTENSION'
  | 'QUEUE'
  | 'RING_GROUP'
  | 'IVR'
  | 'CONFERENCE'
  | 'VOICEMAIL';

export const DID_DESTINATION_OPTIONS: { type: DidDestinationType; label: string }[] = [
  { type: 'EXTENSION', label: 'Extension' },
  { type: 'QUEUE', label: 'Queue' },
  { type: 'RING_GROUP', label: 'Ring Group' },
  { type: 'IVR', label: 'IVR' },
  { type: 'CONFERENCE', label: 'Conference' },
  { type: 'VOICEMAIL', label: 'Voicemail' },
];

export type DidDestinationOption = {
  id: string;
  label: string;
  extension?: string | null;
  userId?: string | null;
  code?: string;
};

export type AssignDidForm = {
  destinationType: DidDestinationType;
  destinationId: string;
  callerIdName: string;
  siteId: string;
};

export const emptyAssignDidForm: AssignDidForm = {
  destinationType: 'EXTENSION',
  destinationId: '',
  callerIdName: '',
  siteId: '',
};
