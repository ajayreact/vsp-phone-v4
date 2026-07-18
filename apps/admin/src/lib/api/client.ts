const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function humanizeErrorBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;

  // Nest/Express sometimes returns HTML when an exception filter itself throws.
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || /<pre>\s*Internal Server Error/i.test(trimmed)) {
    return status >= 500
      ? 'Internal server error. Please retry or check API logs.'
      : `Request failed (HTTP ${status}).`;
  }

  try {
    const json = JSON.parse(trimmed) as { message?: string | string[]; error?: string };
    if (Array.isArray(json.message)) return json.message.join(', ');
    if (typeof json.message === 'string') return json.message;
    if (json.error) return json.error;
  } catch {
    /* not JSON */
  }

  // Cap long non-JSON bodies so toasts stay readable.
  return trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(humanizeErrorBody(text, res.status), res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  return parseJson<T>(res);
}

export { API_BASE };
