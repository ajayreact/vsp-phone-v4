import type { ApiListResponse } from '../../types/telecom';

export function normalizeList<T>(payload: ApiListResponse<T> | T[] | { data: T[] }): T[] {
  if (Array.isArray(payload)) return payload;
  if ('data' in payload && Array.isArray(payload.data)) return payload.data;
  return (payload as ApiListResponse<T>).data ?? [];
}

export function unwrapData<T>(payload: T | { data: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
