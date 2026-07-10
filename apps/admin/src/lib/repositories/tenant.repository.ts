import type { UserRecord } from '../../types/portal';
import type { OpsDashboardSnapshot } from '../../types/telecom';
import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';

export const tenantRepository = {
  getDashboard(): Promise<OpsDashboardSnapshot> {
    return httpGet<OpsDashboardSnapshot>('/v1/tenant/dashboard');
  },

  listUsers(search?: string): Promise<UserRecord[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: UserRecord[] }>(`/v1/tenant/users${q}`).then(normalizeList);
  },

  listDevices(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/devices${q}`).then(normalizeList);
  },

  listExtensions(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/extensions${q}`).then(normalizeList);
  },

  listDids(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/dids${q}`).then(normalizeList);
  },

  listQueues(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/queues').then(normalizeList);
  },

  listIvrs(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/ivrs').then(normalizeList);
  },

  listRingGroups(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/ring-groups').then(normalizeList);
  },

  listVoicemail(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/voicemail').then(normalizeList);
  },

  listRoutingPolicies(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/routing/policies').then(normalizeList);
  },

  listCdr(params?: { from?: string; to?: string; limit?: number }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/cdr${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  listRecordings(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/recordings').then(normalizeList);
  },

  listNumberRequests(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/number-requests').then(normalizeList);
  },

  createNumberRequest(payload: { phoneNumber: string; notes?: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/number-requests', payload);
  },

  createExtension(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/extensions', payload);
  },

  bulkImportExtensions(rows: { extension: string; userId: string; lineName?: string; callerIdName?: string }[]): Promise<{ results: { extension: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/extensions/bulk-import', { rows });
  },

  async exportExtensionsCsv(): Promise<Blob> {
    const { getAccessToken } = await import('../auth/session');
    const { API_BASE } = await import('../api/client');
    const res = await fetch(`${API_BASE}/v1/tenant/extensions/export`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
  },

  createQueue(payload: { name: string; code: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/queues', payload);
  },

  createIvr(payload: { name: string; code: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/ivrs', payload);
  },

  createRingGroup(payload: { name: string; strategy?: string; timeoutSec?: number }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/ring-groups', payload);
  },

  createVoicemail(payload: { lineId: string; pin?: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/voicemail', payload);
  },

  createRoutingPolicy(payload: { lineId: string; inboundEnabled?: boolean; outboundEnabled?: boolean }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/routing/policies', payload);
  },

  updateExtension(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/extensions/${id}`, payload);
  },

  deleteExtension(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/extensions/${id}`);
  },
};
