import type { ApiErrorResponse } from './errors';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly field?: string | null,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseErrorJson(text: string, status: number): ApiError {
  const trimmed = text.trim();
  if (!trimmed) return new ApiError(`HTTP ${status}`, status);

  try {
    const json = JSON.parse(trimmed) as ApiErrorResponse;
    const message = resolveErrorMessage(json, status);
    return new ApiError(
      message,
      status,
      json.code,
      json.field ?? null,
      json.details ?? null,
      json.requestId,
    );
  } catch {
    return new ApiError(
      trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed,
      status,
    );
  }
}

function resolveErrorMessage(json: ApiErrorResponse, status: number): string {
  if (typeof json.message === 'string' && json.message.length > 0) {
    return json.message;
  }
  if (Array.isArray(json.message)) {
    return json.message.join(', ');
  }
  if (json.error) return json.error;
  return `Request failed (HTTP ${status}).`;
}

function humanizeErrorBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;

  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    /<pre>\s*Internal Server Error/i.test(trimmed)
  ) {
    return status >= 500
      ? 'The server encountered an error. Please try again.'
      : `Request failed (HTTP ${status}).`;
  }

  return parseErrorJson(trimmed, status).message;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw parseErrorJson(text, res.status);
  }
  return res.json() as Promise<T>;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const { token, headers, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const effectiveSignal =
    signal ??
    (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: effectiveSignal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 504, 'TIMEOUT');
    }
    throw err;
  }
  return parseJson<T>(res);
}

export { API_BASE, humanizeErrorBody, parseErrorJson };
