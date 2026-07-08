const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export type LoginResult = {
  accessToken: string;
  tokenType: string;
  expiresInSec: number;
  userId: string;
  tenantId: string;
  email: string;
};

export type EnrollResult = {
  sipUsername: string;
  sipPassword: string;
  aor: string;
  realm: string;
  wssUrl: string;
  expiresAt: string;
  iceServers: Array<{ urls: string; username?: string; credential?: string }>;
  deviceId: string;
  sipEndpointId: string;
  enrollTtlSec: number;
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseJson(res);
}

export async function enroll(accessToken: string, deviceId?: string): Promise<EnrollResult> {
  const res = await fetch(`${API_BASE}/v1/telecom/webrtc/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(deviceId ? { deviceId } : {}),
  });
  return parseJson(res);
}

export async function revokeEnroll(accessToken: string, deviceId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/v1/telecom/webrtc/enroll/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ deviceId }),
  });
  return parseJson(res);
}

export async function updatePresence(
  accessToken: string,
  aor: string,
  status: 'OPEN' | 'CLOSED' | 'AWAY' | 'BUSY' | 'UNKNOWN',
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/telecom/webrtc/presence`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ aor, status }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('vsp.accessToken');
}

export function storeToken(token: string): void {
  sessionStorage.setItem('vsp.accessToken', token);
}

export function clearToken(): void {
  sessionStorage.removeItem('vsp.accessToken');
}
