import { NextResponse } from 'next/server';
import { PERMISSIONS, hasPermission } from '../rbac/permissions';
import type { AuthSession } from '../../types/auth';

const API_BASE =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

/** Upstream /v1/auth/me timeout — avoids hanging BFF routes when API is unreachable. */
const AUTH_ME_TIMEOUT_MS = 5_000;

export function getBffApiBase(): string {
  return API_BASE.replace(/\/$/, '');
}

export function getAuthMeUrl(): string {
  return `${getBffApiBase()}/v1/auth/me`;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export type AuthSessionTransportError = {
  name: string;
  message: string;
  causeName?: string;
  causeMessage?: string;
  causeCode?: string;
  aborted?: boolean;
  stack?: string;
};

export type FetchAuthSessionResult =
  | { kind: 'ok'; session: AuthSession; durationMs: number }
  | { kind: 'unauthorized'; status: number; durationMs: number }
  | { kind: 'transport'; url: string; error: AuthSessionTransportError; durationMs: number };

function serializeFetchError(err: unknown): AuthSessionTransportError {
  const e = err as {
    name?: string;
    message?: string;
    stack?: string;
    cause?: unknown;
  };
  const cause = e?.cause as { name?: string; message?: string; code?: string } | undefined;
  const name = e?.name ?? 'Error';
  const message = e?.message ?? String(err);
  const aborted =
    name === 'AbortError' ||
    /aborted|timeout/i.test(message) ||
    cause?.name === 'AbortError' ||
    cause?.code === 'ABORT_ERR';

  return {
    name,
    message,
    causeName: cause?.name,
    causeMessage: cause?.message,
    causeCode: cause?.code,
    aborted,
    stack: e?.stack,
  };
}

function logAuthMe(detail: Record<string, unknown>): void {
  // Server-only structured log — never include tokens or response bodies with PII beyond status.
  const line = JSON.stringify({
    event: 'bff.auth_me',
    apiBase: getBffApiBase(),
    authMeUrl: getAuthMeUrl(),
    method: 'GET',
    timeoutMs: AUTH_ME_TIMEOUT_MS,
    ...detail,
  });
  if (detail.outcome === 'ok') {
    console.info(line);
  } else {
    console.error(line);
  }
}

/**
 * Validate JWT via API /v1/auth/me.
 *
 * Distinguishes:
 * - `ok` — session resolved
 * - `unauthorized` — upstream returned non-2xx (invalid/expired token, etc.)
 * - `transport` — DNS/TCP/TLS/timeout/network failure (not an auth decision)
 */
export async function fetchAuthSession(token: string): Promise<FetchAuthSessionResult> {
  const url = getAuthMeUrl();
  const started = Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(AUTH_ME_TIMEOUT_MS),
    });
    const durationMs = Date.now() - started;

    if (!res.ok) {
      logAuthMe({
        outcome: 'unauthorized',
        phase: 'http',
        status: res.status,
        durationMs,
      });
      return { kind: 'unauthorized', status: res.status, durationMs };
    }

    const data = (await res.json()) as {
      userId: string;
      tenantId: string;
      email: string;
      portal?: AuthSession['portal'];
      impersonatorUserId?: string | null;
      permissions?: string[];
      roles?: AuthSession['roles'];
      tenant?: AuthSession['tenant'];
      profile?: AuthSession['profile'];
    };

    logAuthMe({
      outcome: 'ok',
      phase: 'http',
      status: res.status,
      durationMs,
    });

    return {
      kind: 'ok',
      durationMs,
      session: {
        userId: data.userId,
        tenantId: data.tenantId,
        email: data.email,
        portal: data.portal ?? 'tenant',
        impersonatorUserId: data.impersonatorUserId ?? null,
        permissions: data.permissions ?? [],
        roles: data.roles ?? [],
        tenant: data.tenant ?? null,
        profile: data.profile ?? null,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    const error = serializeFetchError(err);
    logAuthMe({
      outcome: 'transport',
      phase: 'transport',
      durationMs,
      errorName: error.name,
      errorMessage: error.message,
      errorCauseName: error.causeName,
      errorCauseMessage: error.causeMessage,
      errorCauseCode: error.causeCode,
      aborted: error.aborted === true,
      errorStack: error.stack,
    });
    return { kind: 'transport', url, error, durationMs };
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

  const result = await fetchAuthSession(token);

  if (result.kind === 'transport') {
    // Generic client body — transport detail is in server logs only (bff.auth_me).
    return {
      response: NextResponse.json(
        { error: 'Upstream authentication service unavailable' },
        { status: 502 },
      ),
    };
  }

  if (result.kind === 'unauthorized') {
    return {
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }

  const session = result.session;
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
