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

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { message?: string | string[]; error?: string };
      if (Array.isArray(json.message)) message = json.message.join(', ');
      else if (typeof json.message === 'string') message = json.message;
      else if (json.error) message = json.error;
    } catch {
      /* use raw text */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  return parseJson<T>(res);
}

export { API_BASE };
