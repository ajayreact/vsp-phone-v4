import { getAccessToken } from '../auth/session';
import { apiFetch, ApiError, API_BASE } from '../api/client';

export { ApiError, API_BASE };

export async function httpGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, token: getAccessToken() });
}

export async function httpPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    token: getAccessToken(),
  });
}

export async function httpPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    ...init,
    token: getAccessToken(),
  });
}

export async function httpPut<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    ...init,
    token: getAccessToken(),
  });
}

export async function httpDelete<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE', ...init, token: getAccessToken() });
}

export async function httpPostForm<T>(path: string, body: FormData, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body,
    ...init,
    token: getAccessToken(),
  });
}

/** Admin BFF routes (server-side service auth). */
export async function bffGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* use raw text */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}
