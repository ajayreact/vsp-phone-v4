import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';

export const pagingRepository = {
  getReports(): Promise<Record<string, unknown>> {
    return httpGet('/v1/tenant/paging/reports');
  },

  listGroups(kind?: string): Promise<Record<string, unknown>[]> {
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/paging/groups${q}`).then(normalizeList);
  },

  getGroup(id: string): Promise<Record<string, unknown>> {
    return httpGet(`/v1/tenant/paging/groups/${id}`);
  },

  createGroup(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/paging/groups', payload);
  },

  updateGroup(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/paging/groups/${id}`, payload);
  },

  setMembers(id: string, members: { lineId: string; priority?: number }[]): Promise<Record<string, unknown>> {
    return httpPost(`/v1/tenant/paging/groups/${id}/members`, { members });
  },

  deleteGroup(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/paging/groups/${id}`);
  },
};
