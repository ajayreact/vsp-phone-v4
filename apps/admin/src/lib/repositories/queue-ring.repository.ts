import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from '../api/http-client';
import { normalizeList } from './api-utils';

export const queueRingRepository = {
  // Ring groups
  getRingGroup(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/ring-groups/${id}`);
  },

  createRingGroup(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/ring-groups', payload);
  },

  updateRingGroup(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/ring-groups/${id}`, payload);
  },

  deleteRingGroup(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/ring-groups/${id}`);
  },

  cloneRingGroup(id: string, payload: { name: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ring-groups/${id}/clone`, payload);
  },

  bulkImportRingGroups(rows: Record<string, unknown>[]): Promise<{ results: { name: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/ring-groups/bulk-import', { rows });
  },

  replaceRingGroupMembers(id: string, members: Record<string, unknown>[]): Promise<Record<string, unknown>> {
    return httpPut<Record<string, unknown>>(`/v1/tenant/ring-groups/${id}/members`, { members });
  },

  addRingGroupMember(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ring-groups/${id}/members`, payload);
  },

  removeRingGroupMember(ringGroupId: string, memberId: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/ring-groups/${ringGroupId}/members/${memberId}`);
  },

  async exportRingGroupsCsv(): Promise<Blob> {
    const { getAccessToken } = await import('../auth/session');
    const { API_BASE } = await import('../api/client');
    const res = await fetch(`${API_BASE}/v1/tenant/ring-groups/export`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
  },

  exportRingGroupsJson(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/ring-groups/export/json');
  },

  // Queues
  getQueue(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/queues/${id}`);
  },

  getQueueDashboard(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/queues/dashboard');
  },

  getQueueReports(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/queues/${id}/reports`);
  },

  createQueue(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/queues', payload);
  },

  updateQueue(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/queues/${id}`, payload);
  },

  deleteQueue(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/queues/${id}`);
  },

  cloneQueue(id: string, payload: { name: string; code: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${id}/clone`, payload);
  },

  pauseQueue(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${id}/pause`, {});
  },

  resumeQueue(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${id}/resume`, {});
  },

  emergencyCloseQueue(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${id}/emergency-close`, {});
  },

  bulkImportQueues(rows: Record<string, unknown>[]): Promise<{ results: { name: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/queues/bulk-import', { rows });
  },

  replaceQueueMembers(id: string, members: Record<string, unknown>[]): Promise<Record<string, unknown>> {
    return httpPut<Record<string, unknown>>(`/v1/tenant/queues/${id}/members`, { members });
  },

  addQueueMember(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${id}/members`, payload);
  },

  removeQueueMember(queueId: string, memberId: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/queues/${queueId}/members/${memberId}`);
  },

  agentLogin(queueId: string, memberId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${queueId}/members/${memberId}/login`, {});
  },

  agentLogout(queueId: string, memberId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${queueId}/members/${memberId}/logout`, {});
  },

  agentPause(queueId: string, memberId: string, reason?: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${queueId}/members/${memberId}/pause`, { reason });
  },

  agentResume(queueId: string, memberId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${queueId}/members/${memberId}/resume`, {});
  },

  createCallback(queueId: string, payload: { phoneNumber: string; callerName?: string; priority?: number; scheduledAt?: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/queues/${queueId}/callbacks`, payload);
  },

  async exportQueuesCsv(): Promise<Blob> {
    const { getAccessToken } = await import('../auth/session');
    const { API_BASE } = await import('../api/client');
    const res = await fetch(`${API_BASE}/v1/tenant/queues/export`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
  },

  exportQueuesJson(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/queues/export/json');
  },
};
