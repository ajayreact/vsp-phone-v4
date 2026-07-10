import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';

export const receptionRepository = {
  getDashboard(): Promise<Record<string, unknown>> {
    return httpGet('/v1/tenant/reception/dashboard');
  },

  listCalls(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/reception/calls').then(normalizeList);
  },

  listParking(lotId?: string): Promise<Record<string, unknown>[]> {
    const q = lotId ? `?lotId=${encodeURIComponent(lotId)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/reception/parking${q}`).then(normalizeList);
  },

  listParkingLots(): Promise<Record<string, unknown>[]> {
    return httpGet<{ data: Record<string, unknown>[] }>('/v1/tenant/reception/parking-lots').then(normalizeList);
  },

  getReports(days = 30): Promise<Record<string, unknown>> {
    return httpGet(`/v1/tenant/reception/reports?days=${days}`);
  },

  park(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/park', payload);
  },

  retrieve(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/retrieve', payload);
  },

  directedPickup(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/pickup/directed', payload);
  },

  groupPickup(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/pickup/group', payload);
  },

  hold(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/calls/hold', payload);
  },

  mute(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/calls/mute', payload);
  },

  transfer(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/calls/transfer', payload);
  },

  hangup(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/calls/hangup', payload);
  },

  setPresence(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/reception/presence', payload);
  },

  // Presence
  listPresence(search?: string): Promise<Record<string, unknown>[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/presence${q}`).then(normalizeList);
  },

  // Contacts
  listContacts(params?: Record<string, string | boolean | number | undefined>): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', String(params.search));
    if (params?.favoritesOnly) q.set('favoritesOnly', 'true');
    if (params?.type) q.set('type', String(params.type));
    const qs = q.toString();
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/contacts${qs ? `?${qs}` : ''}`).then(normalizeList);
  },

  getDirectory(search?: string): Promise<{ contacts: Record<string, unknown>[]; users: Record<string, unknown>[] }> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return httpGet(`/v1/tenant/contacts/directory${q}`);
  },

  listFavorites(): Promise<Record<string, unknown>[]> {
    return httpGet<Record<string, unknown>[]>('/v1/tenant/contacts/favorites');
  },

  listSpeedDial(): Promise<Record<string, unknown>[]> {
    return httpGet<Record<string, unknown>[]>('/v1/tenant/contacts/speed-dial');
  },

  createContact(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/contacts', payload);
  },

  updateContact(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/contacts/${id}`, payload);
  },

  deleteContact(id: string): Promise<Record<string, unknown>> {
    return httpDelete(`/v1/tenant/contacts/${id}`);
  },

  // BLF
  listBlfPanels(mine?: boolean): Promise<Record<string, unknown>[]> {
    const q = mine ? '?mine=true' : '';
    return httpGet<{ data: Record<string, unknown>[] }>(`/v1/tenant/blf/panels${q}`).then(normalizeList);
  },

  getBlfPanel(id: string): Promise<Record<string, unknown>> {
    return httpGet(`/v1/tenant/blf/panels/${id}`);
  },

  getBlfLamps(panelId: string): Promise<Record<string, unknown>[]> {
    return httpGet<Record<string, unknown>[]>(`/v1/tenant/blf/panels/${panelId}/lamps`);
  },

  createBlfPanel(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost('/v1/tenant/blf/panels', payload);
  },

  updateBlfPanel(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPatch(`/v1/tenant/blf/panels/${id}`, payload);
  },
};
