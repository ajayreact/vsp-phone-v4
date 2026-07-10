import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';

export const ivrRoutingRepository = {
  // IVR
  getIvr(id: string): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/ivrs/${id}`);
  },

  createIvr(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>('/v1/tenant/ivrs', payload);
  },

  updateIvr(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch<Record<string, unknown>>(`/v1/tenant/ivrs/${id}`, payload);
  },

  deleteIvr(id: string): Promise<Record<string, unknown>> {
    return httpDelete<Record<string, unknown>>(`/v1/tenant/ivrs/${id}`);
  },

  saveIvrDraft(id: string, flow: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/draft`, { flow });
  },

  publishIvr(id: string, changeNotes?: string): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/publish`, { changeNotes });
  },

  cloneIvr(id: string, payload: { name: string; code: string }): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/clone`, payload);
  },

  simulateIvr(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/simulate`, payload);
  },

  validateIvr(id: string, flow: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/validate`, { flow });
  },

  getIvrVersions(id: string): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet(`/v1/tenant/ivrs/${id}/versions`);
  },

  restoreIvrVersion(id: string, version: number): Promise<Record<string, unknown>> {
    return httpPost<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/versions/${version}/restore`, {});
  },

  getIvrReports(id: string, days = 7): Promise<Record<string, unknown>> {
    return httpGet<Record<string, unknown>>(`/v1/tenant/ivrs/${id}/reports?days=${days}`);
  },

  bulkImportIvrs(rows: Record<string, unknown>[]): Promise<{ results: { name: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/ivrs/bulk-import', { rows });
  },

  exportIvrsJson(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/ivrs/export/json');
  },

  // Inbound routes
  getInboundRoutes(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/routing/inbound');
  },

  createInboundRoute(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/routing/inbound', payload);
  },

  updateInboundRoute(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/routing/inbound/${id}`, payload);
  },

  deleteInboundRoute(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/routing/inbound/${id}`);
  },

  cloneInboundRoute(id: string, name: string): Promise<Record<string, unknown>> {
    return httpPost(`/v1/tenant/routing/inbound/${id}/clone`, { name });
  },

  bulkImportInbound(rows: Record<string, unknown>[]): Promise<{ results: { name: string; ok: boolean; error?: string }[] }> {
    return httpPost('/v1/tenant/routing/inbound/bulk-import', { rows });
  },

  // Outbound routes
  getOutboundRoutes(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/routing/outbound');
  },

  createOutboundRoute(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/routing/outbound', payload);
  },

  updateOutboundRoute(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/routing/outbound/${id}`, payload);
  },

  deleteOutboundRoute(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/routing/outbound/${id}`);
  },

  testRoute(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/routing/test', payload);
  },

  getRoutingMetrics(): Promise<Record<string, unknown>> {
    return httpGet('/v1/tenant/routing/metrics');
  },

  // Time conditions
  getTimeConditions(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/time-conditions');
  },

  createTimeCondition(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/time-conditions', payload);
  },

  updateTimeCondition(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/time-conditions/${id}`, payload);
  },

  deleteTimeCondition(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/time-conditions/${id}`);
  },

  evaluateTimeCondition(id: string, at?: string): Promise<Record<string, unknown>> {
    return httpPost(`/v1/tenant/time-conditions/${id}/evaluate`, { at });
  },

  // Holiday calendars
  getHolidayCalendars(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/holiday-calendars');
  },

  createHolidayCalendar(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/holiday-calendars', payload);
  },

  updateHolidayCalendar(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/holiday-calendars/${id}`, payload);
  },

  deleteHolidayCalendar(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/holiday-calendars/${id}`);
  },

  // Audio library
  getAnnouncements(category?: string, language?: string): Promise<{ data: Record<string, unknown>[] }> {
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    if (language) q.set('language', language);
    const qs = q.toString();
    return httpGet(`/v1/tenant/audio/announcements${qs ? `?${qs}` : ''}`);
  },

  getAnnouncement(id: string): Promise<Record<string, unknown>> {
    return httpGet(`/v1/tenant/audio/announcements/${id}`);
  },

  getAnnouncementPreview(id: string): Promise<{ url: string | null }> {
    return httpGet(`/v1/tenant/audio/announcements/${id}/preview`);
  },

  getAnnouncementVersions(id: string): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet(`/v1/tenant/audio/announcements/${id}/versions`);
  },

  createAnnouncement(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/audio/announcements', payload);
  },

  updateAnnouncement(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/audio/announcements/${id}`, payload);
  },

  replaceAnnouncement(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost(`/v1/tenant/audio/announcements/${id}/replace`, payload);
  },

  deleteAnnouncement(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/audio/announcements/${id}`);
  },

  presignAudioUpload(payload: { filename: string; contentType?: string }): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/audio/upload/presign', payload);
  },

  getAudioReports(): Promise<Record<string, unknown>> {
    return httpGet('/v1/tenant/audio/reports');
  },

  getMohPlaylists(scope?: string, language?: string): Promise<{ data: Record<string, unknown>[] }> {
    const q = new URLSearchParams();
    if (scope) q.set('scope', scope);
    if (language) q.set('language', language);
    const qs = q.toString();
    return httpGet(`/v1/tenant/audio/moh/playlists${qs ? `?${qs}` : ''}`);
  },

  getMohPlaylist(id: string): Promise<Record<string, unknown>> {
    return httpGet(`/v1/tenant/audio/moh/playlists/${id}`);
  },

  getMohAssignments(): Promise<Record<string, unknown>> {
    return httpGet('/v1/tenant/audio/moh/assignments');
  },

  getMohPlaylistVersions(id: string): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet(`/v1/tenant/audio/moh/playlists/${id}/versions`);
  },

  createMohPlaylist(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/audio/moh/playlists', payload);
  },

  updateMohPlaylist(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/audio/moh/playlists/${id}`, payload);
  },

  deleteMohPlaylist(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/audio/moh/playlists/${id}`);
  },

  createMohTrack(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/audio/moh/tracks', payload);
  },

  reorderMohTracks(playlistId: string, trackIds: string[]): Promise<Record<string, unknown>> {
    return httpPost(`/v1/tenant/audio/moh/playlists/${playlistId}/reorder`, { trackIds });
  },

  getMohTrackPreview(trackId: string): Promise<{ url: string | null }> {
    return httpGet(`/v1/tenant/audio/moh/tracks/${trackId}/preview`);
  },

  deleteMohTrack(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/audio/moh/tracks/${id}`);
  },

  // Dial plans
  getDialPlans(): Promise<{ data: Record<string, unknown>[] }> {
    return httpGet('/v1/tenant/dial-plans');
  },

  createDialPlan(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/dial-plans', payload);
  },

  updateDialPlan(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/dial-plans/${id}`, payload);
  },

  deleteDialPlan(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/dial-plans/${id}`);
  },

  testDialPlan(dialedNumber: string): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/dial-plans/test', { dialedNumber });
  },
};
