import type {
  ApiListResponse,
  AssignTelnyxNumberPayload,
  BillingSummaryRecord,
  BulkAssignPayload,
  ExtensionRecord,
  LiveCallRecord,
  OpsDashboardSnapshot,
  PurchaseTelnyxNumberPayload,
  SipTrunkRecord,
  TelnyxNumberRecord,
  TenantRecord,
} from '../../types/telecom';
import { ApiError } from '../api/client';
import { bffGet, httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';

function normalizeList<T>(payload: ApiListResponse<T> | T[]): T[] {
  if (Array.isArray(payload)) return payload;
  return payload.data ?? [];
}

export const opsRepository = {
  getDashboardSnapshot(tenantId?: string): Promise<OpsDashboardSnapshot> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return bffGet<OpsDashboardSnapshot>(`/api/bff/observability/dashboard${q}`);
  },

  getHealthDetail(): Promise<OpsDashboardSnapshot['infrastructure']> {
    return bffGet<OpsDashboardSnapshot['infrastructure']>('/api/bff/observability/health');
  },
};

export const telnyxNumbersRepository = {
  async list(params?: { search?: string; status?: string; region?: string }): Promise<TelnyxNumberRecord[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.region) searchParams.set('region', params.region);
    const q = searchParams.toString();
    const res = await httpGet<ApiListResponse<TelnyxNumberRecord>>(`/v1/carriers/telnyx/numbers${q ? `?${q}` : ''}`);
    return normalizeList(res);
  },

  assign(id: string, payload: AssignTelnyxNumberPayload): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>(`/v1/carriers/telnyx/numbers/${id}/assign`, payload);
  },

  release(id: string): Promise<void> {
    return httpPost<void>(`/v1/carriers/telnyx/numbers/${id}/release`, {});
  },

  purchase(payload: PurchaseTelnyxNumberPayload): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>('/v1/carriers/telnyx/numbers/purchase', payload);
  },

  update(id: string, payload: Partial<PurchaseTelnyxNumberPayload & { smsEnabled?: boolean; emergencyEnabled?: boolean }>): Promise<TelnyxNumberRecord> {
    return httpPatch<TelnyxNumberRecord>(`/v1/carriers/telnyx/numbers/${id}`, payload);
  },

  remove(id: string): Promise<void> {
    return httpDelete<void>(`/v1/carriers/telnyx/numbers/${id}`);
  },

  bulkAssign(payload: BulkAssignPayload): Promise<TelnyxNumberRecord[]> {
    return httpPost<ApiListResponse<TelnyxNumberRecord>>('/v1/carriers/telnyx/numbers/bulk/assign', payload).then(
      (r) => normalizeList(r),
    );
  },

  bulkRelease(ids: string[]): Promise<void> {
    return httpPost<void>('/v1/carriers/telnyx/numbers/bulk/release', { ids });
  },
};

export const trunksRepository = {
  async list(): Promise<SipTrunkRecord[]> {
    const res = await httpGet<ApiListResponse<SipTrunkRecord>>('/v1/carriers/trunks');
    return normalizeList(res);
  },
};

export const liveCallsRepository = {
  async list(tenantId?: string): Promise<LiveCallRecord[]> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const res = await httpGet<ApiListResponse<LiveCallRecord>>(`/v1/live-calls${q}`);
    return normalizeList(res);
  },
};

export const extensionsRepository = {
  async list(params?: { search?: string }): Promise<ExtensionRecord[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    const q = searchParams.toString();
    const res = await httpGet<ApiListResponse<ExtensionRecord>>(`/v1/extensions${q ? `?${q}` : ''}`);
    return normalizeList(res);
  },
};

const MODULE_COLLECTION_PATH: Record<string, string> = {
  users: '/v1/users',
  devices: '/v1/provisioning/devices',
  'call-recordings': '/v1/recordings',
};

export const billingRepository = {
  async getSummary(): Promise<BillingSummaryRecord> {
    throw new ApiError('Billing module is not enabled in this release.', 501);
  },
};

export const tenantsRepository = {
  async list(): Promise<TenantRecord[]> {
    throw new ApiError('Tenants API is not enabled in this release.', 501);
  },
};

export const resourceRepository = {
  async list(moduleId: string): Promise<Record<string, unknown>[]> {
    const path = MODULE_COLLECTION_PATH[moduleId];
    if (!path) {
      throw new ApiError(`Module "${moduleId}" is not enabled in this release.`, 501);
    }
    const res = await httpGet<ApiListResponse<Record<string, unknown>> | Record<string, unknown>[]>(path);
    return normalizeList(res);
  },
};
