import type { InfraHealthCheck } from './telecom';

export type ApiDataResponse<T> = { data: T };

export type PlatformDashboardComponents = {
  api: InfraHealthCheck;
  postgres: InfraHealthCheck;
  redis: InfraHealthCheck;
  kamailio: InfraHealthCheck;
  rtpengine: InfraHealthCheck;
};

export type PlatformDashboardSnapshot = {
  ts: string;
  totalTenants: number;
  activeTenants: number;
  pendingTenantApprovals: number;
  /** Kept for API compatibility; not shown on Platform Dashboard. */
  totalExtensions: number;
  registeredDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  concurrentCalls: number;
  sipRegistrations: number;
  totalPurchasedDids: number;
  telnyxInventory: number;
  assignedDids: number;
  unassignedDids: number;
  reservedDids: number;
  failedCallsToday: number;
  todaysCallMinutes: number;
  mrrCents: number;
  carrierCostCents: number;
  grossMarginCents: number;
  recordingCount: number;
  storageBytesEstimate: number;
  carrierStatus: InfraHealthCheck;
  components: PlatformDashboardComponents;
  activeAlerts: number;
};

export type PlatformTenantRecord = {
  id: string;
  publicId: string;
  name: string;
  displayName: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformBillingSummary = {
  mrrCents: number;
  carrierCostCents: number;
  grossMarginCents: number;
  activeSubscriptions: number;
  totalInvoices: number;
  unpaidInvoices: number;
  currency: string;
};

export type PlatformPlanRecord = {
  id: string;
  publicId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  seatLimit: number;
  didLimit: number;
  active: boolean;
};

export type PlatformCarrierRecord = {
  id: string;
  publicId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  code: string;
  carrierType: string;
  status: string;
  healthStatus: 'up' | 'down' | 'degraded' | 'unknown';
};

export type PlatformRoleRecord = {
  id: string;
  publicId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  description: string | null;
  systemRole: boolean;
  permissionCount: number;
};

export type PlatformPermissionRecord = {
  id: string;
  publicId: string;
  tenantId: string;
  tenantName: string;
  key: string;
  description: string | null;
};

export type AuditLogRecord = {
  id?: string;
  ts: string;
  action: string;
  actor?: string;
  userId?: string;
  tenantId?: string;
  ip?: string;
  ipAddress?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
};

export type OpsHealthDetail = {
  components: Record<string, InfraHealthCheck>;
  readiness: {
    ready?: boolean;
    checks?: Array<{ name: string; status: string; message?: string }>;
  };
};

export type SipRegistrationRecord = {
  id: string;
  username: string;
  extension?: string | null;
  domain?: string;
  tenantId?: string;
  tenantName?: string;
  status: string;
  lastRegisteredAt?: string | null;
};

export type UserRecord = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  extension: string | null;
  status: string;
  tenantId?: string;
  tenantName?: string;
};

export type PlatformSettingsRecord = {
  id: string;
  platformName: string;
  supportEmail: string;
  defaultTimezone: string;
  inventoryTenantId: string | null;
  stripeEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpFromEmail: string | null;
  smtpUseTls: boolean;
  smtpConfigured: boolean;
  updatedAt: string;
};

export type PlatformProvisioningSettings = {
  baseUrl: string;
  vendors: Array<{
    manufacturer: string;
    label: string;
    path: string;
    exampleUrl: string;
  }>;
  status: {
    status: 'up' | 'down' | 'degraded';
    latencyMs?: number;
    checkedAt: string;
    healthUrl: string;
    failureReason?: string;
  };
  templates: Array<{
    id: string;
    name: string;
    manufacturer: string;
    modelFamily: string | null;
    templateKind: string;
    isDefault: boolean;
    tenantId: string;
    tenantName: string;
  }>;
  builtInTemplateFamilies: Array<{
    manufacturer: string;
    label: string;
    families: string[];
  }>;
};

export type PlatformApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  scopes: string[];
  tenantId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type PlatformSearchResult = {
  type: 'tenant' | 'user' | 'number' | 'extension';
  id: string;
  label: string;
  subtitle: string;
  href: string;
};

export type OrganizationRecord = {
  tenantId: string;
  name: string;
  displayName: string;
  slug: string;
  status: string;
  timezone: string | null;
  defaultLanguage: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  logoUrl: string | null;
  sites: Array<{
    id: string;
    name: string;
    status: string;
    postalCode: string | null;
    description: string | null;
    businessHours: string | null;
  }>;
};

export type OnboardTenantResult = {
  tenant: PlatformTenantRecord;
  adminUserId: string;
  siteId: string;
  subscriptionId: string;
};
