import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthPortal = 'platform' | 'ops' | 'tenant';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  /** Portal this token is valid for. */
  portal: AuthPortal;
  /** Set when Platform Admin is impersonating a tenant. */
  impersonatorUserId?: string;
  iat?: number;
  exp?: number;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, ttlSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + Math.max(60, ttlSec),
    }),
  );
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(b64urlDecode(body)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.tenantId || !payload.exp || payload.exp < now) return null;
    if (!payload.portal || !['platform', 'ops', 'tenant'].includes(payload.portal)) return null;
    return payload;
  } catch {
    return null;
  }
}
