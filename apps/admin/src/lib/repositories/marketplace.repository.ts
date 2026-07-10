import type {
  FavoriteNumber,
  MarketplaceDashboard,
  MarketplaceNumber,
  MarketplaceReports,
  MarketplaceSearchParams,
  NumberNotification,
  NumberReservation,
  PlatformNumberRequest,
  SavedSearch,
  TenantNumberRequest,
} from '../../types/marketplace';
import { httpDelete, httpGet, httpPatch, httpPost } from '../api/http-client';
import { normalizeList } from './api-utils';

function searchParams(params?: MarketplaceSearchParams): string {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) {
      q.set(key, String(value));
    }
  }
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

export const marketplaceRepository = {
  getDashboard(): Promise<MarketplaceDashboard> {
    return httpGet<{ data: MarketplaceDashboard }>('/v1/tenant/marketplace/dashboard').then((r) => r.data);
  },

  searchInventory(params?: MarketplaceSearchParams): Promise<MarketplaceNumber[]> {
    return httpGet<{ data: MarketplaceNumber[] }>(`/v1/tenant/marketplace/inventory${searchParams(params)}`).then(normalizeList);
  },

  reserve(phoneNumber: string, countryCode?: string): Promise<NumberReservation> {
    return httpPost<NumberReservation>('/v1/tenant/marketplace/reserve', { phoneNumber, countryCode });
  },

  cancelReservation(id: string): Promise<{ ok: boolean }> {
    return httpDelete<{ ok: boolean }>(`/v1/tenant/marketplace/reservations/${id}`);
  },

  listFavorites(): Promise<FavoriteNumber[]> {
    return httpGet<{ data: FavoriteNumber[] }>('/v1/tenant/marketplace/favorites').then(normalizeList);
  },

  addFavorite(phoneNumber: string): Promise<{ phoneNumber: string }> {
    return httpPost<{ phoneNumber: string }>('/v1/tenant/marketplace/favorites', { phoneNumber });
  },

  removeFavorite(phoneNumber: string): Promise<{ ok: boolean }> {
    return httpDelete<{ ok: boolean }>(`/v1/tenant/marketplace/favorites/${encodeURIComponent(phoneNumber)}`);
  },

  listSavedSearches(): Promise<SavedSearch[]> {
    return httpGet<{ data: SavedSearch[] }>('/v1/tenant/marketplace/saved-searches').then(normalizeList);
  },

  createSavedSearch(name: string, filters: Record<string, unknown>): Promise<SavedSearch> {
    return httpPost<SavedSearch>('/v1/tenant/marketplace/saved-searches', { name, filters });
  },

  deleteSavedSearch(id: string): Promise<{ ok: boolean }> {
    return httpDelete<{ ok: boolean }>(`/v1/tenant/marketplace/saved-searches/${id}`);
  },

  listNotifications(unreadOnly?: boolean): Promise<NumberNotification[]> {
    const q = unreadOnly ? '?unreadOnly=true' : '';
    return httpGet<{ data: NumberNotification[] }>(`/v1/tenant/marketplace/notifications${q}`).then(normalizeList);
  },

  markNotificationRead(id: string): Promise<NumberNotification> {
    return httpPatch<{ data: NumberNotification }>(`/v1/tenant/marketplace/notifications/${id}/read`, {}).then((r) => r.data);
  },

  markAllNotificationsRead(): Promise<{ count: number }> {
    return httpPatch<{ count: number }>('/v1/tenant/marketplace/notifications/read-all', {});
  },

  listRequests(status?: string): Promise<TenantNumberRequest[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return httpGet<{ data: TenantNumberRequest[] }>(`/v1/tenant/number-requests${q}`).then(normalizeList);
  },

  getRequest(id: string): Promise<TenantNumberRequest> {
    return httpGet<{ data: TenantNumberRequest }>(`/v1/tenant/number-requests/${id}`).then((r) => r.data);
  },

  createRequest(payload: {
    phoneNumber: string;
    reservationId?: string;
    notes?: string;
    businessReason?: string;
    priority?: string;
    requestedFeatures?: string[];
  }): Promise<TenantNumberRequest> {
    return httpPost<TenantNumberRequest>('/v1/tenant/number-requests', payload);
  },

  bulkCreateRequests(payload: {
    phoneNumbers: string[];
    notes?: string;
    businessReason?: string;
    priority?: string;
  }): Promise<{ succeeded: TenantNumberRequest[]; failed: Array<{ phoneNumber: string; error: string }> }> {
    return httpPost('/v1/tenant/number-requests/bulk', payload);
  },

  cancelRequest(id: string): Promise<TenantNumberRequest> {
    return httpPost<TenantNumberRequest>(`/v1/tenant/number-requests/${id}/cancel`, {});
  },

  withdrawRequest(id: string): Promise<TenantNumberRequest> {
    return httpPost<TenantNumberRequest>(`/v1/tenant/number-requests/${id}/withdraw`, {});
  },

  duplicateRequest(id: string): Promise<TenantNumberRequest> {
    return httpPost<TenantNumberRequest>(`/v1/tenant/number-requests/${id}/duplicate`, {});
  },
};

export const platformMarketplaceRepository = {
  listRequests(status?: string): Promise<PlatformNumberRequest[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return httpGet<{ data: PlatformNumberRequest[] }>(`/v1/carriers/telnyx/numbers/requests${q}`).then(normalizeList);
  },

  getRequest(id: string): Promise<PlatformNumberRequest> {
    return httpGet<{ data: PlatformNumberRequest }>(`/v1/carriers/telnyx/numbers/requests/${id}`).then((r) => r.data);
  },

  getRequestHistory(id: string): Promise<{ request: PlatformNumberRequest; audit: Array<{ auditId: string; ts: string; action: string }> }> {
    return httpGet(`/v1/carriers/telnyx/numbers/requests/${id}/history`).then((r) => r as { request: PlatformNumberRequest; audit: Array<{ auditId: string; ts: string; action: string }> });
  },

  approveRequest(id: string, payload?: { notes?: string; internalNotes?: string; action?: 'assign' | 'purchase_then_assign' }) {
    return httpPost(`/v1/carriers/telnyx/numbers/requests/${id}/approve`, payload ?? {});
  },

  rejectRequest(id: string, payload?: { notes?: string; internalNotes?: string }) {
    return httpPost(`/v1/carriers/telnyx/numbers/requests/${id}/reject`, payload ?? {});
  },

  bulkApprove(ids: string[], payload?: { notes?: string; internalNotes?: string; action?: 'assign' | 'purchase_then_assign' }) {
    return httpPost('/v1/carriers/telnyx/numbers/requests/bulk/approve', { ids, ...payload });
  },

  bulkReject(ids: string[], notes?: string) {
    return httpPost('/v1/carriers/telnyx/numbers/requests/bulk/reject', { ids, notes });
  },

  getReports(): Promise<MarketplaceReports> {
    return httpGet<{ data: MarketplaceReports }>('/v1/carriers/telnyx/numbers/reports/marketplace').then((r) => r.data);
  },
};
