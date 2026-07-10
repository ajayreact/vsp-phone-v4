import type {
  ApiDataResponse,
  AuditLogRecord,
  OnboardTenantResult,
  OrganizationRecord,
  PlatformApiKeyRecord,
  PlatformBillingSummary,
  PlatformCarrierRecord,
  PlatformDashboardSnapshot,
  PlatformPermissionRecord,
  PlatformRoleRecord,
  PlatformSearchResult,
  PlatformSettingsRecord,
  PlatformTenantRecord,
  UserRecord,
} from '../../types/portal';
import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList, unwrapData } from './api-utils';

export type CreateTenantPayload = {
  name: string;
  displayName?: string;
  status?: string;
};

export type OnboardTenantPayload = {
  name: string;
  displayName?: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  timezone?: string;
  defaultLanguage?: string;
  siteName?: string;
};

export type UpdateTenantPayload = {
  name?: string;
  displayName?: string;
  slug?: string;
  status?: string;
};

export type UpdatePlatformSettingsPayload = {
  platformName?: string;
  supportEmail?: string;
  defaultTimezone?: string;
  inventoryTenantId?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  smtpFromEmail?: string | null;
  smtpUseTls?: boolean;
};

export type CreatePlatformUserPayload = {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleName?: string;
};

export type CreatePlatformRolePayload = {
  tenantId: string;
  name: string;
  description?: string;
  permissionIds?: string[];
};

export type CreateApiKeyPayload = {
  name: string;
  tenantId?: string;
  scopes?: string[];
  expiresAt?: string;
};

export const platformRepository = {
  getDashboard(): Promise<PlatformDashboardSnapshot> {
    return httpGet<ApiDataResponse<PlatformDashboardSnapshot>>('/v1/platform/dashboard').then(unwrapData);
  },

  listTenants(params?: { search?: string; status?: string }): Promise<PlatformTenantRecord[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return httpGet<ApiDataResponse<PlatformTenantRecord[]>>(`/v1/platform/tenants${qs ? `?${qs}` : ''}`).then(
      normalizeList,
    );
  },

  getTenant(id: string): Promise<PlatformTenantRecord> {
    return httpGet<ApiDataResponse<PlatformTenantRecord>>(`/v1/platform/tenants/${id}`).then(unwrapData);
  },

  createTenant(payload: CreateTenantPayload): Promise<PlatformTenantRecord> {
    return httpPost<ApiDataResponse<PlatformTenantRecord>>('/v1/platform/tenants', payload).then(unwrapData);
  },

  onboardTenant(payload: OnboardTenantPayload): Promise<OnboardTenantResult> {
    return httpPost<ApiDataResponse<OnboardTenantResult>>('/v1/platform/tenants/onboard', payload).then(unwrapData);
  },

  updateTenant(id: string, payload: UpdateTenantPayload): Promise<PlatformTenantRecord> {
    return httpPatch<ApiDataResponse<PlatformTenantRecord>>(`/v1/platform/tenants/${id}`, payload).then(unwrapData);
  },

  suspendTenant(id: string): Promise<PlatformTenantRecord> {
    return httpPost<ApiDataResponse<PlatformTenantRecord>>(`/v1/platform/tenants/${id}/suspend`, {}).then(unwrapData);
  },

  activateTenant(id: string): Promise<PlatformTenantRecord> {
    return httpPost<ApiDataResponse<PlatformTenantRecord>>(`/v1/platform/tenants/${id}/activate`, {}).then(unwrapData);
  },

  deleteTenant(id: string): Promise<PlatformTenantRecord> {
    return httpDelete<ApiDataResponse<PlatformTenantRecord>>(`/v1/platform/tenants/${id}`).then(unwrapData);
  },

  getBillingSummary(): Promise<PlatformBillingSummary> {
    return httpGet<ApiDataResponse<PlatformBillingSummary>>('/v1/platform/billing/summary').then(unwrapData);
  },

  listCarriers(): Promise<PlatformCarrierRecord[]> {
    return httpGet<ApiDataResponse<PlatformCarrierRecord[]>>('/v1/platform/carriers').then(normalizeList);
  },

  listRoles(tenantId?: string): Promise<PlatformRoleRecord[]> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiDataResponse<PlatformRoleRecord[]>>(`/v1/platform/roles${q}`).then(normalizeList);
  },

  createRole(payload: CreatePlatformRolePayload): Promise<PlatformRoleRecord> {
    return httpPost<ApiDataResponse<PlatformRoleRecord>>('/v1/platform/roles', payload).then(unwrapData);
  },

  deleteRole(id: string): Promise<void> {
    return httpDelete<ApiDataResponse<{ ok: boolean }>>(`/v1/platform/roles/${id}`).then(() => undefined);
  },

  listPermissions(tenantId?: string): Promise<PlatformPermissionRecord[]> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiDataResponse<PlatformPermissionRecord[]>>(`/v1/platform/permissions${q}`).then(normalizeList);
  },

  listAudit(params?: { tenantId?: string; limit?: number; actionPrefix?: string }): Promise<AuditLogRecord[]> {
    const q = new URLSearchParams();
    if (params?.tenantId) q.set('tenantId', params.tenantId);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.actionPrefix) q.set('actionPrefix', params.actionPrefix);
    const qs = q.toString();
    return httpGet<ApiDataResponse<AuditLogRecord[]>>(`/v1/platform/audit${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  listUsers(params?: { tenantId?: string; search?: string }): Promise<UserRecord[]> {
    const q = new URLSearchParams();
    if (params?.tenantId) q.set('tenantId', params.tenantId);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return httpGet<ApiDataResponse<UserRecord[]>>(`/v1/platform/users${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  createUser(payload: CreatePlatformUserPayload): Promise<UserRecord> {
    return httpPost<ApiDataResponse<UserRecord>>('/v1/platform/users', payload).then(unwrapData);
  },

  deleteUser(id: string): Promise<void> {
    return httpDelete<ApiDataResponse<{ ok: boolean }>>(`/v1/platform/users/${id}`).then(() => undefined);
  },

  getSettings(): Promise<PlatformSettingsRecord> {
    return httpGet<ApiDataResponse<PlatformSettingsRecord>>('/v1/platform/settings').then(unwrapData);
  },

  updateSettings(payload: UpdatePlatformSettingsPayload): Promise<PlatformSettingsRecord> {
    return httpPatch<ApiDataResponse<PlatformSettingsRecord>>('/v1/platform/settings', payload).then(unwrapData);
  },

  listApiKeys(tenantId?: string): Promise<PlatformApiKeyRecord[]> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiDataResponse<PlatformApiKeyRecord[]>>(`/v1/platform/api-keys${q}`).then(normalizeList);
  },

  createApiKey(payload: CreateApiKeyPayload): Promise<PlatformApiKeyRecord & { secret: string }> {
    return httpPost<ApiDataResponse<PlatformApiKeyRecord & { secret: string }>>('/v1/platform/api-keys', payload).then(
      unwrapData,
    );
  },

  revokeApiKey(id: string): Promise<PlatformApiKeyRecord> {
    return httpDelete<ApiDataResponse<PlatformApiKeyRecord>>(`/v1/platform/api-keys/${id}`).then(unwrapData);
  },

  search(q: string, limit = 20): Promise<PlatformSearchResult[]> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return httpGet<ApiDataResponse<PlatformSearchResult[]>>(`/v1/platform/search?${params}`).then(normalizeList);
  },

  getOrganization(tenantId: string): Promise<OrganizationRecord> {
    return httpGet<ApiDataResponse<OrganizationRecord>>(`/v1/platform/organization/${tenantId}`).then(unwrapData);
  },

  updateOrganization(
    tenantId: string,
    payload: { displayName?: string; timezone?: string; defaultLanguage?: string },
  ): Promise<OrganizationRecord> {
    return httpPatch<ApiDataResponse<OrganizationRecord>>(`/v1/platform/organization/${tenantId}`, payload).then(
      unwrapData,
    );
  },
};
