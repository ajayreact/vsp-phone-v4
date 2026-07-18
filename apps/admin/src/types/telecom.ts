/** Domain types for telecom operations — aligned with API contracts. */

export type ApiListResponse<T> = {
  data: T[];
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
};

export type ApiDataResponse<T> = { data: T };

export type BulkResult<T> = {
  succeeded: T[];
  failed: Array<{ id?: string; phoneNumber?: string; error: string }>;
};

export type InfraHealthStatus = 'up' | 'down' | 'degraded';

export type InfraHealthCheck = {
  status: InfraHealthStatus;
  latencyMs?: number;
  message?: string;
  version?: string;
  failureReason?: string;
  lastSuccessfulCheck?: string;
};

export type OpsDashboardSnapshot = {
  ts: string;
  tenantId: string;
  activeCalls: number;
  concurrentCalls?: number;
  registeredDevices: number;
  registeredExtensions?: number;
  telnyxInventory?: number;
  assignedDids?: number;
  unassignedDids?: number;
  availableDids?: number;
  sipRegistrations?: number;
  failedCallsToday?: number;
  activeConferences: number;
  activeQueues: number;
  queueWaiting?: number;
  onlineTenants: number;
  onboarding?: {
    checklist: { id: string; label: string; done: boolean }[];
    completed: number;
    total: number;
    percent: number;
  } | null;
  redis: { available: boolean };
  postgres: { connected: boolean };
  infrastructure: {
    api: InfraHealthCheck;
    postgres: InfraHealthCheck;
    redis: InfraHealthCheck;
    kamailio: InfraHealthCheck;
    rtpengine: InfraHealthCheck;
    telnyx: InfraHealthCheck;
  };
};

export type TelnyxDashboardStats = {
  totalNumbers: number;
  assigned: number;
  available: number;
  reserved: number;
  pendingPort: number;
  porting: number;
  released: number;
  smsEnabled: number;
  voiceEnabled: number;
  emergencyEnabled: number;
  monthlyCost: number;
  inventoryValue: number;
};

export type TelnyxSyncStatus = {
  lastSyncAt: string | null;
  status: string;
  lastError?: string | null;
  added: number;
  updated: number;
  failed: number;
  conflicts: number;
};

export type TelnyxAvailableNumber = {
  phoneNumber: string;
  region: string;
  monthlyCost: number;
  upfrontCost: number;
  features: string[];
  phoneNumberType: string;
  reservable: boolean;
  quickship: boolean;
  vanityFormat: string | null;
  regulatoryRequirements: string[];
};

export type TelnyxNumberRecord = {
  id: string;
  number: string;
  e164: string;
  telnyxId?: string | null;
  connectionType?: string;
  connectionId?: string | null;
  voiceProfile?: string;
  messagingProfile?: string;
  smsEnabled: boolean;
  mmsEnabled: boolean;
  emergencyEnabled: boolean;
  emergencyAddress?: string | null;
  cnam?: string | null;
  assignedTenantId: string | null;
  assignedTenantName: string | null;
  assignedSiteId?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  assignedExtension: string | null;
  registrationStatus?: string | null;
  assignedIvr: string | null;
  assignedQueue: string | null;
  assignedRingGroup?: string | null;
  assignedVoicemail?: string | null;
  assignedConference?: string | null;
  forwardTo?: string | null;
  region: string;
  monthlyCost: number;
  purchasedAt: string;
  status: 'active' | 'available' | 'pending' | 'porting' | 'suspended' | 'released';
  tags?: string[];
  notes?: string | null;
  regulatoryBundle?: string | null;
};

export type TelnyxNumberHistory = {
  assignments: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
  reservations: Array<{
    id: string;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>;
  audit: Array<{
    auditId: string;
    ts: string;
    action: string;
    detail?: Record<string, unknown>;
  }>;
};

export type TelnyxNumberRequest = {
  id: string;
  tenantId: string;
  tenantName: string;
  phoneNumber: string;
  status: string;
  requestedBy: string;
  requesterEmail?: string;
  reviewedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelnyxReservation = {
  id: string;
  phoneNumber: string;
  countryCode: string;
  status: string;
  expiresAt: string;
};

export type SipTrunkRecord = {
  id: string;
  name: string;
  carrier: string;
  sipHost: string;
  registration: 'registered' | 'unregistered' | 'failed';
  latencyMs: number;
  packetLossPct: number;
  channelsTotal: number;
  channelsInUse: number;
  peakCallsToday: number;
  optionsPingMs: number | null;
  lastFailureAt: string | null;
  failoverEnabled: boolean;
  health: InfraHealthStatus;
  concurrentCalls?: number;
  lastRegistrationAt?: string | null;
  lastOptionsAt?: string | null;
};

export type LiveCallRecord = {
  id: string;
  platformUuid: string;
  caller: string;
  callee: string;
  tenantId: string;
  tenantName: string;
  extension?: string | null;
  trunk: string;
  codec: string;
  mos: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  durationSec: number;
  recording: boolean;
  status: string;
  direction: string;
};

export type ExtensionRecord = {
  id: string;
  extension: string;
  userId: string | null;
  userDisplayName: string | null;
  tenantId?: string;
  tenantName?: string;
  department: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  registration: 'online' | 'offline' | 'unknown';
  presence: string;
  voicemailEnabled: boolean;
  callForward: string | null;
  dnd: boolean;
  callerId?: string | null;
  lastRegistrationAt: string | null;
  codec: string | null;
};

export type SearchAvailableParams = {
  countryCode?: string;
  administrativeArea?: string;
  locality?: string;
  postalCode?: string;
  areaCode?: string;
  nationalDestinationCode?: string;
  prefix?: string;
  contains?: string;
  endsWith?: string;
  startsWith?: string;
  vanity?: string;
  phoneNumberType?: string;
  voice?: boolean;
  sms?: boolean;
  mms?: boolean;
  emergency?: boolean;
  quickship?: boolean;
  bestEffort?: boolean;
  search?: string;
  limit?: number;
};

export type PurchaseTelnyxNumberPayload = {
  phoneNumber?: string;
  countryCode?: string;
  region?: string;
  connectionId?: string;
  messagingProfileId?: string;
  voiceProfile?: string;
  reservationId?: string;
};

export type BulkAssignPayload = {
  ids: string[];
  tenantId: string;
  siteId?: string;
  extension?: string;
  startExtension?: string;
  extensions?: string[];
};

export type AssignTelnyxNumberPayload = {
  tenantId: string;
  siteId?: string;
  department?: string;
  extension?: string;
  ivr?: string;
  queue?: string;
  ringGroup?: string;
  voicemail?: string;
  conference?: string;
  forwardTo?: string;
};

export type UpdateTelnyxNumberPayload = {
  voiceProfile?: string;
  messagingProfile?: string;
  smsEnabled?: boolean;
  emergencyEnabled?: boolean;
  emergencyAddress?: string;
  cnam?: string;
  connectionId?: string;
  notes?: string;
  tags?: string[];
};

export type TenantRecord = {
  id: string;
  name: string;
  plan: string;
  extensions: number;
  users: number;
  status: 'active' | 'suspended' | 'pending';
};

export type BillingSummaryRecord = {
  currentPeriod: string;
  platformMrr: number;
  telnyxSpend: number;
  usageMinutes: number;
  overageMinutes: number;
  tenantUsage: Array<{
    tenantId: string;
    tenantName: string;
    plan: string;
    extensions: number;
    estimatedMrr: number;
    telnyxNumbers: number;
  }>;
};
