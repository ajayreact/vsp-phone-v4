import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';

export const deviceRepository = {
  listDevices(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/devices${q}`).then(normalizeList);
  },

  getDevice(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/devices/${id}`);
  },

  createDevice(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/devices', payload);
  },

  updateDevice(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/devices/${id}`, payload);
  },

  deleteDevice(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/devices/${id}`);
  },

  clearDevice(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/clear`, {});
  },

  resetDevice(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/reset`, {});
  },

  assignDevice(id: string, lineId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/assign`, { lineId });
  },

  unassignDevice(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/unassign`, {});
  },

  deactivateDevice(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/deactivate`, {});
  },

  activateDevice(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/activate`, {});
  },

  makePrimary(id: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/make-primary`, {});
  },

  cloneDevice(id: string, payload: { name: string; macAddress?: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/devices/${id}/clone`, payload);
  },

  bulkImport(rows: Record<string, unknown>[]): Promise<{ results: { name: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/devices/bulk-import', { rows });
  },

  bulkAssign(deviceIds: string[], lineId: string): Promise<{ results: { deviceId: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/devices/bulk-assign', { deviceIds, lineId });
  },

  bulkDelete(deviceIds: string[]): Promise<{ results: { deviceId: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/devices/bulk-delete', { deviceIds });
  },

  async exportCsv(): Promise<Blob> {
    const { getAccessToken } = await import('../auth/session');
    const { API_BASE } = await import('../api/client');
    const res = await fetch(`${API_BASE}/v1/tenant/devices/export`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
  },

  enroll(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/provisioning/devices/enroll', payload);
  },

  reprovision(deviceId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/provisioning/devices/reprovision', { deviceId });
  },

  rollback(deviceId: string, targetConfigVersion: number): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/provisioning/devices/rollback', {
      deviceId,
      targetConfigVersion,
    });
  },

  previewConfig(deviceId: string): Promise<{ content: string; configVersion?: number; artifactHash?: string }> {
    return httpGet(`/v1/tenant/provisioning/devices/${deviceId}/config/preview`);
  },

  configHistory(deviceId: string): Promise<Record<string, unknown>[]> {
    return httpGet<Record<string, unknown>[]>(`/v1/tenant/provisioning/devices/${deviceId}/config/history`);
  },

  bulkProvision(deviceIds: string[]): Promise<{ results: { deviceId: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/provisioning/devices/bulk-provision', { deviceIds });
  },

  bulkReboot(deviceIds: string[]): Promise<{ results: { deviceId: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/provisioning/devices/bulk-reboot', { deviceIds });
  },

  bulkFactoryReset(deviceIds: string[]): Promise<{ results: { deviceId: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/provisioning/devices/bulk-factory-reset', { deviceIds });
  },

  rebootDevice(deviceId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/provisioning/devices/${deviceId}/reboot`, {});
  },

  factoryResetDevice(deviceId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/provisioning/devices/${deviceId}/factory-reset`, {});
  },

  listFirmware(): Promise<{ catalog: Record<string, unknown>[]; releases: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/provisioning/firmware');
  },

  approveFirmware(releaseId: string, rolloutPercent?: number): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/provisioning/firmware/approve', { releaseId, rolloutPercent });
  },

  listTemplates(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>('/v1/tenant/provisioning/templates').then(
      (res) => (Array.isArray(res) ? res : normalizeList(res as { data: Record<string, unknown>[] })),
    );
  },

  createTemplate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/provisioning/templates', payload);
  },

  updateTemplate(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/provisioning/templates/${id}`, payload);
  },

  deleteTemplate(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/provisioning/templates/${id}`);
  },
};
