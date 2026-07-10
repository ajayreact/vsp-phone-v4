import type { AuditLogRecord, OpsHealthDetail, SipRegistrationRecord } from '../../types/portal';
import type { OpsDashboardSnapshot } from '../../types/telecom';
import { httpGet } from '../api/http-client';
import { normalizeList } from './api-utils';

export const opsRepository = {
  getDashboard(tenantId?: string): Promise<OpsDashboardSnapshot> {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<OpsDashboardSnapshot>(`/v1/ops/dashboard${q}`);
  },

  getHealth(): Promise<OpsHealthDetail> {
    return httpGet<OpsHealthDetail>('/v1/ops/health');
  },

  getKamailioPersistence(): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>('/v1/ops/kamailio/persistence');
  },

  getRtpengineNodes(): Promise<{ nodes: Record<string, unknown>[] }> {
    return httpGet<{ nodes: Record<string, unknown>[] }>('/v1/ops/rtpengine/nodes');
  },

  getRedisStats(): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>('/v1/ops/redis/stats');
  },

  getPostgresStats(): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>('/v1/ops/postgres/stats');
  },

  getCarriersHealth(): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>('/v1/ops/carriers/health');
  },

  listAudit(params?: { tenantId?: string; limit?: number; actionPrefix?: string }): Promise<AuditLogRecord[]> {
    const q = new URLSearchParams();
    if (params?.tenantId) q.set('tenantId', params.tenantId);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.actionPrefix) q.set('actionPrefix', params.actionPrefix);
    const qs = q.toString();
    return httpGet<{ data: AuditLogRecord[] }>(`/v1/ops/audit${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  listSipRegistrations(params?: { tenantId?: string; limit?: number }): Promise<SipRegistrationRecord[]> {
    const q = new URLSearchParams();
    if (params?.tenantId) q.set('tenantId', params.tenantId);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet<{ data: SipRegistrationRecord[] }>(`/v1/ops/sip/registrations${qs ? `?${qs}` : ''}`).then(
      normalizeList,
    );
  },

  traceCalls(params?: { tenantId?: string; platformUuid?: string; limit?: number }): Promise<Record<string, unknown>> {
    const q = new URLSearchParams();
    if (params?.tenantId) q.set('tenantId', params.tenantId);
    if (params?.platformUuid) q.set('platformUuid', params.platformUuid);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet<Record<string, unknown>>(`/v1/ops/trace/calls${qs ? `?${qs}` : ''}`);
  },
};
