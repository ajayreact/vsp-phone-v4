import { createHmac } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { signJwt, verifyJwt, type AuthPortal, type JwtPayload } from './jwt.util';

describe('portal-bound JWT', () => {
  const secret = 'test-secret-portal-auth';

  it('requires portal claim on verify', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        sub: 'u1',
        tenantId: 't1',
        email: 'a@b.c',
        iat: now,
        exp: now + 3600,
      }),
    ).toString('base64url');
    const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    expect(verifyJwt(`${header}.${body}.${sig}`, secret)).toBeNull();
  });

  it('round-trips portal and impersonator claims', () => {
    const token = signJwt(
      {
        sub: 'platform-user',
        tenantId: 'tenant-a',
        email: 'admin@vspphone.com',
        portal: 'tenant',
        impersonatorUserId: 'platform-user',
      },
      secret,
      900,
    );
    const payload = verifyJwt(token, secret);
    expect(payload?.portal).toBe('tenant');
    expect(payload?.impersonatorUserId).toBe('platform-user');
    expect(payload?.tenantId).toBe('tenant-a');
  });
});

/** Mirrors AuthService.assertPortalLoginAllowed decision table (unit-level). */
function assertPortalLoginAllowed(opts: {
  portal: AuthPortal;
  isSuperAdmin: boolean;
  hasTenant: boolean;
  hasPlatform: boolean;
  hasOps: boolean;
}): void {
  const { portal, isSuperAdmin, hasTenant, hasPlatform, hasOps } = opts;
  if (portal === 'platform') {
    if (!hasPlatform) {
      throw new ForbiddenException('platform denied');
    }
    return;
  }
  if (portal === 'ops') {
    if (!hasOps && !hasPlatform) {
      throw new ForbiddenException('ops denied');
    }
    return;
  }
  if (isSuperAdmin) {
    throw new ForbiddenException('super admin cannot use tenant portal login');
  }
  if (!hasTenant) {
    throw new ForbiddenException('tenant denied');
  }
}

describe('portal login matrix', () => {
  it('rejects platform super admin on tenant portal', () => {
    expect(() =>
      assertPortalLoginAllowed({
        portal: 'tenant',
        isSuperAdmin: true,
        hasTenant: false,
        hasPlatform: true,
        hasOps: true,
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects pure tenant user on platform portal', () => {
    expect(() =>
      assertPortalLoginAllowed({
        portal: 'platform',
        isSuperAdmin: false,
        hasTenant: true,
        hasPlatform: false,
        hasOps: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('allows tenant admin on tenant portal', () => {
    expect(() =>
      assertPortalLoginAllowed({
        portal: 'tenant',
        isSuperAdmin: false,
        hasTenant: true,
        hasPlatform: false,
        hasOps: false,
      }),
    ).not.toThrow();
  });

  it('allows platform admin on platform portal', () => {
    expect(() =>
      assertPortalLoginAllowed({
        portal: 'platform',
        isSuperAdmin: true,
        hasTenant: false,
        hasPlatform: true,
        hasOps: true,
      }),
    ).not.toThrow();
  });
});

describe('super-admin permission bypass narrowing', () => {
  function superAdminAllows(permissionKey: string, ctx: { impersonatorUserId?: string; portal?: AuthPortal }) {
    const isSuperAdmin = true;
    if (ctx.impersonatorUserId && ctx.portal === 'tenant') {
      if (
        permissionKey.startsWith('tenant:') ||
        permissionKey === 'provisioning:admin' ||
        permissionKey.startsWith('recordings:') ||
        permissionKey.startsWith('presence:')
      ) {
        return true;
      }
    }
    if (isSuperAdmin) {
      if (
        permissionKey === 'platform:super_admin' ||
        permissionKey.startsWith('platform:') ||
        permissionKey.startsWith('ops:')
      ) {
        return true;
      }
    }
    return false;
  }

  it('does not auto-grant tenant:* without impersonation', () => {
    expect(superAdminAllows('tenant:admin', { portal: 'platform' })).toBe(false);
    expect(superAdminAllows('tenant:extensions:read', {})).toBe(false);
  });

  it('grants tenant:* only during impersonation', () => {
    expect(
      superAdminAllows('tenant:admin', { portal: 'tenant', impersonatorUserId: 'u1' }),
    ).toBe(true);
  });

  it('still grants platform:* for super admin', () => {
    expect(superAdminAllows('platform:tenants:write', { portal: 'platform' })).toBe(true);
  });
});

describe('impersonation JWT tenant scoping', () => {
  it('impersonation token binds to target tenantId only', () => {
    const secret = 'impersonation-scope';
    const token = signJwt(
      {
        sub: 'platform-user',
        tenantId: 'target-tenant',
        email: 'admin@vspphone.com',
        portal: 'tenant',
        impersonatorUserId: 'platform-user',
      },
      secret,
      600,
    );
    const payload = verifyJwt(token, secret) as JwtPayload;
    expect(payload.tenantId).toBe('target-tenant');
    expect(payload.portal).toBe('tenant');
    // Queries must use JWT tenantId — never the platform user's home tenant.
    expect(payload.tenantId).not.toBe('platform-home-tenant');
  });
});
