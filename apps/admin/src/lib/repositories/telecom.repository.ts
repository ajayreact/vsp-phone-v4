import type {
  ApiListResponse,
  AssignTelnyxNumberPayload,
  BulkAssignPayload,
  ExtensionRecord,
  LiveCallRecord,
  PurchaseTelnyxNumberPayload,
  SipTrunkRecord,
  TelnyxNumberRecord,
} from '../../types/telecom';
import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';
import { opsRepository } from './ops.repository';
import { platformRepository } from './platform.repository';

export { opsRepository, platformRepository };
export { tenantRepository } from './tenant.repository';

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

  async searchAvailable(params?: {
    countryCode?: string;
    areaCode?: string;
    contains?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const searchParams = new URLSearchParams();
    if (params?.countryCode) searchParams.set('countryCode', params.countryCode);
    if (params?.areaCode) searchParams.set('areaCode', params.areaCode);
    if (params?.contains) searchParams.set('contains', params.contains);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const q = searchParams.toString();
    const res = await httpGet<ApiListResponse<Record<string, unknown>>>(
      `/v1/carriers/telnyx/numbers/search/available${q ? `?${q}` : ''}`,
    );
    return normalizeList(res);
  },

  reserve(payload: { phoneNumber: string; countryCode?: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/carriers/telnyx/numbers/reserve', payload);
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

  update(
    id: string,
    payload: Partial<PurchaseTelnyxNumberPayload & { smsEnabled?: boolean; emergencyEnabled?: boolean }>,
  ): Promise<TelnyxNumberRecord> {
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

/** @deprecated Use platformRepository.listTenants */
export const tenantsRepository = {
  list: platformRepository.listTenants,
};

/** @deprecated Use platformRepository.getBillingSummary */
export const billingRepository = {
  getSummary: platformRepository.getBillingSummary,
};
