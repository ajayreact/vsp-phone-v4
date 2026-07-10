import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';

export type RecordingSearchParams = {
  search?: string;
  from?: string;
  to?: string;
  lineId?: string;
  queueId?: string;
  ivrId?: string;
  category?: string;
  bookmarkedOnly?: boolean;
  legalHoldOnly?: boolean;
  limit?: number;
};

export type VoicemailMessageSearchParams = {
  search?: string;
  unreadOnly?: boolean;
  flaggedOnly?: boolean;
  from?: string;
  to?: string;
  limit?: number;
};

export const vcrCommunicationsRepository = {
  // Voicemail mailboxes
  listVoicemail(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/voicemail${q}`).then(normalizeList);
  },

  getVoicemail(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/voicemail/${id}`);
  },

  getVoicemailReports(days = 30): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/voicemail/reports?days=${days}`);
  },

  createVoicemail(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/voicemail', payload);
  },

  updateVoicemail(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/voicemail/${id}`, payload);
  },

  deleteVoicemail(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/voicemail/${id}`);
  },

  listVoicemailMessages(voicemailId: string, params?: VoicemailMessageSearchParams): Promise<{ data: Record<string, unknown>[] }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.unreadOnly) q.set('unreadOnly', 'true');
    if (params?.flaggedOnly) q.set('flaggedOnly', 'true');
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet(`/v1/tenant/voicemail/${voicemailId}/messages${qs ? `?${qs}` : ''}`);
  },

  getVoicemailMessagePlayback(voicemailId: string, messageId: string): Promise<{ url: string }> {
    return httpGet<{ url: string }>(`/v1/tenant/voicemail/${voicemailId}/messages/${messageId}/playback`);
  },

  updateVoicemailMessage(messageId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/voicemail/messages/${messageId}`, payload);
  },

  deleteVoicemailMessage(messageId: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/voicemail/messages/${messageId}`);
  },

  restoreVoicemailMessage(messageId: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/voicemail/messages/${messageId}/restore`, {});
  },

  bulkDeleteVoicemailMessages(messageIds: string[]): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/voicemail/messages/bulk-delete', { messageIds });
  },

  bulkMarkVoicemailRead(messageIds: string[], read: boolean): Promise<Record<string, unknown>> {
    const path = read ? 'bulk-read' : 'bulk-unread';
    return httpPost(`/v1/tenant/voicemail/messages/${path}`, { messageIds });
  },

  upsertVoicemailGreeting(voicemailId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/voicemail/${voicemailId}/greetings`, payload);
  },

  // Conferences
  listConferences(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/conferences${q}`).then(normalizeList);
  },

  getConference(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/conferences/${id}`);
  },

  getConferenceLive(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/conferences/${id}/live`);
  },

  getConferenceReports(days = 30): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/conferences/reports?days=${days}`);
  },

  createConference(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/conferences', payload);
  },

  updateConference(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/conferences/${id}`, payload);
  },

  cloneConference(id: string, payload: { name: string; code: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/conferences/${id}/clone`, payload);
  },

  deleteConference(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/conferences/${id}`);
  },

  updateConferenceParticipant(
    conferenceId: string,
    participantId: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(
      `/v1/tenant/conferences/${conferenceId}/participants/${participantId}`,
      payload,
    );
  },

  removeConferenceParticipant(conferenceId: string, participantId: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(
      `/v1/tenant/conferences/${conferenceId}/participants/${participantId}`,
    );
  },

  // Recordings
  searchRecordings(params?: RecordingSearchParams): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.lineId) q.set('lineId', params.lineId);
    if (params?.queueId) q.set('queueId', params.queueId);
    if (params?.ivrId) q.set('ivrId', params.ivrId);
    if (params?.category) q.set('category', params.category);
    if (params?.bookmarkedOnly) q.set('bookmarkedOnly', 'true');
    if (params?.legalHoldOnly) q.set('legalHoldOnly', 'true');
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/recordings${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  getRecording(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/recordings/${id}`);
  },

  getRecordingPlayback(id: string): Promise<{ url: string }> {
    return httpGet<{ url: string }>(`/v1/tenant/recordings/${id}/playback`);
  },

  getRecordingTranscript(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/recordings/${id}/transcript`);
  },

  getRecordingReports(days = 30): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/recordings/reports?days=${days}`);
  },

  updateRecording(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/recordings/${id}`, payload);
  },

  annotateRecording(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/recordings/${id}/annotations`, payload);
  },

  bulkDeleteRecordings(recordingIds: string[]): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/recordings/bulk-delete', { recordingIds });
  },

  deleteRecording(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/recordings/${id}`);
  },

  // Recording policies
  listRecordingPolicies(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/recording-policies').then(normalizeList);
  },

  getRecordingPolicy(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/recording-policies/${id}`);
  },

  createRecordingPolicy(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/recording-policies', payload);
  },

  updateRecordingPolicy(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/recording-policies/${id}`, payload);
  },

  deleteRecordingPolicy(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/recording-policies/${id}`);
  },
};
