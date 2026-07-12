import {
  BFF_OBSERVABILITY_CALLS_PERMISSIONS,
  BFF_OBSERVABILITY_READ_PERMISSIONS,
  extractBearerToken,
  resolveBffTenantId,
} from './bff-auth';
import { PERMISSIONS, hasPermission } from '../rbac/permissions';

describe('bff-auth', () => {
  describe('extractBearerToken', () => {
    it('returns null when Authorization header is missing', () => {
      const req = new Request('http://localhost/api/bff/observability/health');
      expect(extractBearerToken(req)).toBeNull();
    });

    it('returns null for non-Bearer schemes', () => {
      const req = new Request('http://localhost/api/bff/observability/health', {
        headers: { Authorization: 'Basic abc123' },
      });
      expect(extractBearerToken(req)).toBeNull();
    });

    it('extracts Bearer token', () => {
      const req = new Request('http://localhost/api/bff/observability/health', {
        headers: { Authorization: 'Bearer test-token-xyz' },
      });
      expect(extractBearerToken(req)).toBe('test-token-xyz');
    });
  });

  describe('resolveBffTenantId', () => {
    it('uses JWT tenantId only', () => {
      expect(
        resolveBffTenantId({
          userId: 'u1',
          tenantId: 'tenant-from-jwt',
          email: 'a@b.com',
          permissions: [],
          roles: [],
          tenant: null,
          profile: null,
        }),
      ).toBe('tenant-from-jwt');
    });
  });

  describe('permission sets', () => {
    it('allows platform super admin for observability read', () => {
      expect(
        hasPermission([PERMISSIONS.PLATFORM_SUPER_ADMIN], [...BFF_OBSERVABILITY_READ_PERMISSIONS]),
      ).toBe(true);
    });

    it('allows ops health read for observability read', () => {
      expect(hasPermission([PERMISSIONS.OPS_HEALTH_READ], [...BFF_OBSERVABILITY_READ_PERMISSIONS])).toBe(
        true,
      );
    });

    it('denies tenant-only permissions for observability read', () => {
      expect(
        hasPermission([PERMISSIONS.TENANT_EXTENSIONS_READ], [...BFF_OBSERVABILITY_READ_PERMISSIONS]),
      ).toBe(false);
    });

    it('allows ops live calls read for calls route', () => {
      expect(
        hasPermission([PERMISSIONS.OPS_LIVE_CALLS_READ], [...BFF_OBSERVABILITY_CALLS_PERMISSIONS]),
      ).toBe(true);
    });

    it('denies tenant admin for calls BFF route', () => {
      expect(hasPermission([PERMISSIONS.TENANT_ADMIN], [...BFF_OBSERVABILITY_CALLS_PERMISSIONS])).toBe(
        false,
      );
    });
  });
});
