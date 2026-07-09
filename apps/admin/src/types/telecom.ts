/** Domain types for telecom operations — aligned with API contracts. */

export type ApiListResponse<T> = {
  data: T[];
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
};

export type InfraHealthStatus = 'up' | 'down' | 'degraded';

export type InfraHealthCheck = {
  status: InfraHealthStatus;
  latencyMs?: number;
  message?: string;
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

export type TelnyxNumberRecord = {
  id: string;
  number: string;
  e164: string;
  connectionType?: string;
  voiceProfile?: string;
  smsEnabled: boolean;
  mmsEnabled: boolean;
  emergencyEnabled: boolean;
  assignedTenantId: string | null;
  assignedTenantName: string | null;
  assignedExtension: string | null;
  assignedIvr: string | null;
  assignedQueue: string | null;
  region: string;
  monthlyCost: number;
  purchasedAt: string;
  status: 'active' | 'available' | 'pending' | 'porting' | 'suspended' | 'released';
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

export type PurchaseTelnyxNumberPayload = {
  phoneNumber?: string;
  countryCode?: string;
  region?: string;
  connectionId?: string;
  voiceProfile?: string;
};

export type BulkAssignPayload = {
  ids: string[];
  tenantId: string;
  extension?: string;
};

export type AssignTelnyxNumberPayload = {
  tenantId: string;
  extension?: string;
  ivr?: string;
  queue?: string;
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
