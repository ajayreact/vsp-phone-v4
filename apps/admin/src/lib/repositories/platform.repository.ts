import type {
  ApiDataResponse,
  AuditLogRecord,
  PlatformBillingSummary,
  PlatformCarrierRecord,
  PlatformDashboardSnapshot,
  PlatformPermissionRecord,
  PlatformRoleRecord,
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

export type UpdateTenantPayload = {
  name?: string;
  displayName?: string;
  slug?: string;
  status?: string;
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

  listUsers(search?: string): Promise<UserRecord[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<ApiDataResponse<UserRecord[]>>(`/v1/users${q}`).then(normalizeList);
  },
};
