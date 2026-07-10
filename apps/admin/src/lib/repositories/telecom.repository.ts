import type {
  ApiDataResponse,
  ApiListResponse,
  AssignTelnyxNumberPayload,
  BulkAssignPayload,
  BulkResult,
  PurchaseTelnyxNumberPayload,
  SearchAvailableParams,
  TelnyxAvailableNumber,
  TelnyxDashboardStats,
  TelnyxNumberHistory,
  TelnyxNumberRecord,
  TelnyxNumberRequest,
  TelnyxReservation,
  TelnyxSyncStatus,
  UpdateTelnyxNumberPayload,
  ExtensionRecord,
  LiveCallRecord,
  SipTrunkRecord,
} from '../../types/telecom';
import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList, unwrapData } from './api-utils';
import { opsRepository } from './ops.repository';
import { platformRepository } from './platform.repository';

export { opsRepository, platformRepository };
export { tenantRepository } from './tenant.repository';

const BASE = '/v1/carriers/telnyx/numbers';

export const telnyxNumbersRepository = {
  async list(params?: { search?: string; status?: string; region?: string; tag?: string }): Promise<TelnyxNumberRecord[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.region) searchParams.set('region', params.region);
    if (params?.tag) searchParams.set('tag', params.tag);
    const q = searchParams.toString();
    const res = await httpGet<ApiListResponse<TelnyxNumberRecord>>(`${BASE}${q ? `?${q}` : ''}`);
    return normalizeList(res);
  },

  getDashboard(): Promise<TelnyxDashboardStats> {
    return httpGet<ApiDataResponse<TelnyxDashboardStats>>(`${BASE}/dashboard`).then(unwrapData);
  },

  getSyncStatus(): Promise<TelnyxSyncStatus> {
    return httpGet<ApiDataResponse<TelnyxSyncStatus>>(`${BASE}/sync/status`).then(unwrapData);
  },

  triggerSync(): Promise<TelnyxSyncStatus> {
    return httpPost<ApiDataResponse<TelnyxSyncStatus>>(`${BASE}/sync`, {}).then(unwrapData);
  },

  get(id: string): Promise<TelnyxNumberRecord> {
    return httpGet<ApiDataResponse<TelnyxNumberRecord>>(`${BASE}/${id}`).then(unwrapData);
  },

  getHistory(id: string): Promise<TelnyxNumberHistory> {
    return httpGet<ApiDataResponse<TelnyxNumberHistory>>(`${BASE}/${id}/history`).then(unwrapData);
  },

  async searchAvailable(params: SearchAvailableParams): Promise<TelnyxAvailableNumber[]> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') searchParams.set(k, String(v));
    });
    const q = searchParams.toString();
    const res = await httpGet<ApiListResponse<TelnyxAvailableNumber>>(`${BASE}/search/available${q ? `?${q}` : ''}`);
    return normalizeList(res);
  },

  listMarketplace(search?: string): Promise<TelnyxNumberRecord[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<ApiListResponse<TelnyxNumberRecord>>(`${BASE}/marketplace${q}`).then(normalizeList);
  },

  reserve(payload: { phoneNumber: string; countryCode?: string }): Promise<TelnyxReservation> {
    return httpPost<TelnyxReservation>(`${BASE}/reserve`, payload);
  },

  assign(id: string, payload: AssignTelnyxNumberPayload): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>(`${BASE}/${id}/assign`, payload);
  },

  reassign(id: string, payload: AssignTelnyxNumberPayload): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>(`${BASE}/${id}/reassign`, payload);
  },

  suspend(id: string): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>(`${BASE}/${id}/suspend`, {});
  },

  activate(id: string): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>(`${BASE}/${id}/activate`, {});
  },

  release(id: string): Promise<void> {
    return httpPost<void>(`${BASE}/${id}/release`, {});
  },

  purchase(payload: PurchaseTelnyxNumberPayload): Promise<TelnyxNumberRecord> {
    return httpPost<TelnyxNumberRecord>(`${BASE}/purchase`, payload);
  },

  update(id: string, payload: UpdateTelnyxNumberPayload): Promise<TelnyxNumberRecord> {
    return httpPatch<TelnyxNumberRecord>(`${BASE}/${id}`, payload);
  },

  remove(id: string): Promise<void> {
    return httpDelete<void>(`${BASE}/${id}`);
  },

  bulkAssign(payload: BulkAssignPayload): Promise<BulkResult<TelnyxNumberRecord>> {
    return httpPost<BulkResult<TelnyxNumberRecord>>(`${BASE}/bulk/assign`, payload);
  },

  bulkRelease(ids: string[]): Promise<BulkResult<string>> {
    return httpPost<BulkResult<string>>(`${BASE}/bulk/release`, { ids });
  },

  bulkPurchase(phoneNumbers: string[], connectionId?: string): Promise<BulkResult<TelnyxNumberRecord>> {
    return httpPost<BulkResult<TelnyxNumberRecord>>(`${BASE}/bulk/purchase`, { phoneNumbers, connectionId });
  },

  bulkReserve(phoneNumbers: string[]): Promise<BulkResult<TelnyxReservation>> {
    return httpPost<BulkResult<TelnyxReservation>>(`${BASE}/bulk/reserve`, { phoneNumbers });
  },

  bulkTag(ids: string[], tags: string[]): Promise<TelnyxNumberRecord[]> {
    return httpPost<ApiListResponse<TelnyxNumberRecord>>(`${BASE}/bulk/tag`, { ids, tags }).then(normalizeList);
  },

  bulkEmergency(ids: string[], emergencyAddress: string): Promise<TelnyxNumberRecord[]> {
    return httpPost<ApiListResponse<TelnyxNumberRecord>>(`${BASE}/bulk/emergency`, {
      ids,
      emergencyAddress,
      emergencyEnabled: true,
    }).then(normalizeList);
  },

  listRequests(status?: string): Promise<TelnyxNumberRequest[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return httpGet<ApiListResponse<TelnyxNumberRequest>>(`${BASE}/requests${q}`).then(normalizeList);
  },

  approveRequest(id: string, payload?: { notes?: string; internalNotes?: string; action?: 'assign' | 'purchase_then_assign' }): Promise<unknown> {
    return httpPost(`${BASE}/requests/${id}/approve`, payload ?? {});
  },

  rejectRequest(id: string, payload?: { notes?: string; internalNotes?: string }): Promise<unknown> {
    return httpPost(`${BASE}/requests/${id}/reject`, payload ?? {});
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

export const tenantsRepository = {
  list: platformRepository.listTenants,
};

export const billingRepository = {
  getSummary: platformRepository.getBillingSummary,
};
