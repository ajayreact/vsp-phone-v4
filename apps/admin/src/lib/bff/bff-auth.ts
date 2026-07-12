import { NextResponse } from 'next/server';
import { PERMISSIONS, hasPermission } from '../rbac/permissions';
import type { AuthSession } from '../../types/auth';

const API_BASE =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function fetchAuthSession(token: string): Promise<AuthSession | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      userId: string;
      tenantId: string;
      email: string;
      permissions?: string[];
      roles?: AuthSession['roles'];
      tenant?: AuthSession['tenant'];
      profile?: AuthSession['profile'];
    };
    return {
      userId: data.userId,
      tenantId: data.tenantId,
      email: data.email,
      permissions: data.permissions ?? [],
      roles: data.roles ?? [],
      tenant: data.tenant ?? null,
      profile: data.profile ?? null,
    };
  } catch {
    return null;
  }
}

/** Permissions for observability health, dashboard, readiness BFF routes. */
export const BFF_OBSERVABILITY_READ_PERMISSIONS = [
  PERMISSIONS.PLATFORM_SUPER_ADMIN,
  PERMISSIONS.OPS_HEALTH_READ,
  PERMISSIONS.OPS_INFRA_READ,
  PERMISSIONS.OPS_DASHBOARD_READ,
] as const;

/** Permissions for live call diagnostics BFF route. */
export const BFF_OBSERVABILITY_CALLS_PERMISSIONS = [
  PERMISSIONS.PLATFORM_SUPER_ADMIN,
  PERMISSIONS.OPS_LIVE_CALLS_READ,
  PERMISSIONS.OPS_DASHBOARD_READ,
] as const;

/** Tenant scope from JWT only — never trust query parameters. */
export function resolveBffTenantId(session: AuthSession): string {
  return session.tenantId;
}

export type BffAuthSuccess = { session: AuthSession; token: string };
export type BffAuthFailure = { response: NextResponse };

export async function requireBffAuth(
  request: Request,
  requiredPermissions: readonly string[],
): Promise<BffAuthSuccess | BffAuthFailure> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const session = await fetchAuthSession(token);
  if (!session) {
    return {
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }

  if (!hasPermission(session.permissions, [...requiredPermissions])) {
    return {
      response: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
    };
  }

  return { session, token };
}

export function bffUnauthorized(): NextResponse {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

export function bffForbidden(): NextResponse {
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
}
