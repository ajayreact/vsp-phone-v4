import type { AuthSession, LoginResult } from '../../types/auth';
import { apiFetch } from './client';

export async function loginRequest(email: string, password: string): Promise<LoginResult> {
  return apiFetch<LoginResult>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchMe(token: string): Promise<AuthSession> {
  const data = await apiFetch<{
    userId: string;
    tenantId: string;
    email: string;
    permissions: string[];
    roles: { id: string; name: string }[];
    tenant?: { id: string; name: string; slug: string };
    profile?: { firstName: string; lastName: string; displayName: string };
  }>('/v1/auth/me', { token });

  return {
    userId: data.userId,
    tenantId: data.tenantId,
    email: data.email,
    permissions: data.permissions,
    roles: data.roles,
    tenant: data.tenant ?? null,
    profile: data.profile ?? null,
  };
}

export async function issueRefreshToken(token: string): Promise<{ refreshToken: string; expiresInSec: number }> {
  return apiFetch('/v1/auth/refresh-token/issue', { method: 'POST', token });
}

export async function refreshAccessToken(refreshToken: string): Promise<LoginResult> {
  return apiFetch<LoginResult>('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logoutRequest(token: string, refreshToken?: string): Promise<void> {
  await apiFetch('/v1/auth/logout', {
    method: 'POST',
    token,
    body: JSON.stringify({ refreshToken }),
  });
}
