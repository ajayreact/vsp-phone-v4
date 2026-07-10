import type {
  CallTimeline,
  CoachingNote,
  SupervisorAgent,
  SupervisorDashboard,
  SupervisorLiveCall,
  SupervisorQueue,
  SupervisorRecording,
  SupervisorReports,
  SupervisorWallboard,
} from '../../types/supervisor';
import type { ApiDataResponse, ApiListResponse } from '../../types/telecom';
import { httpGet, httpPost } from '../api/http-client';
import { normalizeList, unwrapData } from './api-utils';

const BASE = '/v1/supervisor';

function tenantQuery(tenantId?: string): string {
  return tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
}

export const supervisorRepository = {
  getDashboard(tenantId?: string): Promise<SupervisorDashboard> {
    return httpGet<ApiDataResponse<SupervisorDashboard>>(`${BASE}/dashboard${tenantQuery(tenantId)}`).then(unwrapData);
  },

  getWallboard(tenantId?: string): Promise<SupervisorWallboard> {
    return httpGet<ApiDataResponse<SupervisorWallboard>>(`${BASE}/wallboard${tenantQuery(tenantId)}`).then(unwrapData);
  },

  listAgents(tenantId?: string): Promise<SupervisorAgent[]> {
    return httpGet<ApiListResponse<SupervisorAgent>>(`${BASE}/agents${tenantQuery(tenantId)}`).then(normalizeList);
  },

  listQueues(tenantId?: string): Promise<SupervisorQueue[]> {
    return httpGet<ApiListResponse<SupervisorQueue>>(`${BASE}/queues/live${tenantQuery(tenantId)}`).then(normalizeList);
  },

  listLiveCalls(tenantId?: string): Promise<SupervisorLiveCall[]> {
    return httpGet<ApiListResponse<SupervisorLiveCall>>(`${BASE}/calls/live${tenantQuery(tenantId)}`).then(normalizeList);
  },

  getCallTimeline(platformUuid: string, tenantId?: string): Promise<CallTimeline> {
    const q = tenantQuery(tenantId).replace('?', tenantId ? '?' : '');
    const suffix = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return httpGet<ApiDataResponse<CallTimeline>>(`${BASE}/calls/${encodeURIComponent(platformUuid)}/timeline${suffix}`).then(
      unwrapData,
    );
  },

  listen(platformUuid: string, supervisorLineId?: string) {
    return httpPost(`${BASE}/calls/listen`, { platformUuid, supervisorLineId });
  },

  whisper(platformUuid: string, supervisorLineId?: string) {
    return httpPost(`${BASE}/calls/whisper`, { platformUuid, supervisorLineId });
  },

  barge(platformUuid: string, supervisorLineId?: string) {
    return httpPost(`${BASE}/calls/barge`, { platformUuid, supervisorLineId });
  },

  takeOver(platformUuid: string, supervisorLineId?: string) {
    return httpPost(`${BASE}/calls/takeover`, { platformUuid, supervisorLineId });
  },

  hangUp(platformUuid: string) {
    return httpPost(`${BASE}/calls/hangup`, { platformUuid });
  },

  transfer(platformUuid: string, target: string) {
    return httpPost(`${BASE}/calls/transfer`, { platformUuid, target });
  },

  endSupervision(platformUuid: string) {
    return httpPost(`${BASE}/calls/supervision/end`, { platformUuid });
  },

  pauseAgent(lineId: string, reason?: string) {
    return httpPost(`${BASE}/agents/pause`, { lineId, reason });
  },

  resumeAgent(lineId: string) {
    return httpPost(`${BASE}/agents/resume`, { lineId });
  },

  forceLogout(lineId: string) {
    return httpPost(`${BASE}/agents/force-logout`, { lineId });
  },

  moveAgent(lineId: string, queueId: string) {
    return httpPost(`${BASE}/agents/move`, { lineId, queueId });
  },

  pauseQueue(queueId: string) {
    return httpPost(`${BASE}/queues/pause`, { queueId });
  },

  resumeQueue(queueId: string) {
    return httpPost(`${BASE}/queues/resume`, { queueId });
  },

  overflowQueue(queueId: string, overflowQueueId?: string) {
    return httpPost(`${BASE}/queues/overflow`, { queueId, overflowQueueId });
  },

  emergencyCloseQueue(queueId: string) {
    return httpPost(`${BASE}/queues/emergency-close`, { queueId });
  },

  emergencyStop() {
    return httpPost(`${BASE}/emergency-stop`, {});
  },

  searchRecordings(params?: { search?: string; from?: string; to?: string; limit?: number }): Promise<SupervisorRecording[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet<ApiListResponse<SupervisorRecording>>(`${BASE}/recordings${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  getRecordingUrl(id: string): Promise<{ url: string }> {
    return httpGet<{ url: string }>(`${BASE}/recordings/${encodeURIComponent(id)}/url`);
  },

  annotateRecording(id: string, type: 'FLAG' | 'COMMENT' | 'BOOKMARK', body?: string) {
    return httpPost(`${BASE}/recordings/${encodeURIComponent(id)}/annotate`, { type, body });
  },

  listCoaching(callSessionId?: string): Promise<CoachingNote[]> {
    const q = callSessionId ? `?callSessionId=${encodeURIComponent(callSessionId)}` : '';
    return httpGet<ApiListResponse<CoachingNote>>(`${BASE}/coaching${q}`).then(normalizeList);
  },

  addCoaching(payload: {
    callSessionId: string;
    agentLineId?: string;
    qualityScore?: number;
    agentScore?: number;
    notes?: string;
    whisperUsed?: boolean;
  }) {
    return httpPost(`${BASE}/coaching`, payload);
  },

  getReports(tenantId?: string): Promise<SupervisorReports> {
    return httpGet<ApiDataResponse<SupervisorReports>>(`${BASE}/reports${tenantQuery(tenantId)}`).then(unwrapData);
  },
};
