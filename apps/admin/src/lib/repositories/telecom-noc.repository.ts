import type { ApiDataResponse, ApiListResponse } from '../../types/telecom';
import type { FraudScan, NocAlert, NocDashboard, NocSipDialog, NocSipRegistration } from '../../types/telecom-noc';
import { httpGet, httpPost } from '../api/http-client';
import { normalizeList, unwrapData } from './api-utils';

const BASE = '/v1/ops';

export const telecomNocRepository = {
  getDashboard(tenantId?: string): Promise<NocDashboard> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiDataResponse<NocDashboard>>(`${BASE}/noc/dashboard${q}`).then(unwrapData);
  },

  listSipRegistrations(params?: { tenantId?: string; search?: string; limit?: number }): Promise<NocSipRegistration[]> {
    const q = new URLSearchParams();
    if (params?.tenantId) q.set('tenantId', params.tenantId);
    if (params?.search) q.set('search', params.search);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet<ApiListResponse<NocSipRegistration>>(`${BASE}/sip/registrations/enriched${qs ? `?${qs}` : ''}`).then(
      normalizeList,
    );
  },

  refreshRegistration(id: string) {
    return httpPost(`${BASE}/sip/registrations/${encodeURIComponent(id)}/refresh`, {});
  },

  unregister(id: string, reason?: string) {
    return httpPost(`${BASE}/sip/registrations/${encodeURIComponent(id)}/unregister`, { reason });
  },

  forceReregister(id: string) {
    return httpPost(`${BASE}/sip/registrations/${encodeURIComponent(id)}/force-reregister`, {});
  },

  listDialogs(tenantId?: string): Promise<NocSipDialog[]> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiListResponse<NocSipDialog>>(`${BASE}/sip/dialogs${q}`).then(normalizeList);
  },

  searchSipTrace(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const qs = q.toString();
    return httpGet<Record<string, unknown>>(`${BASE}/sip/trace${qs ? `?${qs}` : ''}`);
  },

  listMediaSessions(tenantId?: string) {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiListResponse<Record<string, unknown>>>(`${BASE}/media/sessions${q}`).then(normalizeList);
  },

  getKamailioDashboard() {
    return httpGet<Record<string, unknown>>(`${BASE}/kamailio/dashboard`);
  },

  kamailioReload(note?: string) {
    return httpPost(`${BASE}/kamailio/reload`, { note });
  },

  getRtpengineDashboard(tenantId?: string) {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<Record<string, unknown>>(`${BASE}/rtpengine/dashboard${q}`);
  },

  getCarrierMonitoring() {
    return httpGet<Record<string, unknown>>(`${BASE}/carriers/monitoring`);
  },

  listAlerts(params?: { status?: string; severity?: string }) {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.severity) q.set('severity', params.severity);
    const qs = q.toString();
    return httpGet<ApiListResponse<NocAlert>>(`${BASE}/alerts${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  acknowledgeAlert(id: string, note?: string) {
    return httpPost(`${BASE}/alerts/${encodeURIComponent(id)}/acknowledge`, { note });
  },

  resolveAlert(id: string, note?: string) {
    return httpPost(`${BASE}/alerts/${encodeURIComponent(id)}/resolve`, { note });
  },

  fraudScan(tenantId?: string): Promise<FraudScan> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<FraudScan>(`${BASE}/fraud/scan${q}`);
  },

  runSynthetic() {
    return httpPost<Record<string, unknown>>(`${BASE}/synthetic/run`, {});
  },

  getCallDiagnostics(platformUuid: string, tenantId?: string) {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiDataResponse<Record<string, unknown>>>(
      `${BASE}/diagnostics/calls/${encodeURIComponent(platformUuid)}${q}`,
    ).then(unwrapData);
  },
};
