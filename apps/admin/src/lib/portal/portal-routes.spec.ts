import {
  isPathAllowedForPortal,
  portalFromHostname,
  resolvePortal,
} from './portal-routes';

describe('portal routing', () => {
  describe('portalFromHostname', () => {
    it('maps production hostnames to portals', () => {
      expect(portalFromHostname('admin.vspphone.com')).toBe('platform');
      expect(portalFromHostname('app.vspphone.com')).toBe('ops');
      expect(portalFromHostname('tenant.vspphone.com')).toBe('tenant');
    });

    it('returns null for localhost', () => {
      expect(portalFromHostname('localhost')).toBeNull();
    });
  });

  describe('resolvePortal', () => {
    it('prefers hostname over NEXT_PUBLIC_PORTAL (single-container deploy)', () => {
      expect(resolvePortal('app.vspphone.com', 'platform')).toBe('ops');
      expect(resolvePortal('admin.vspphone.com', 'ops')).toBe('platform');
      expect(resolvePortal('tenant.vspphone.com', 'platform')).toBe('tenant');
    });

    it('uses env portal on localhost when hostname is unknown', () => {
      expect(resolvePortal('localhost', 'platform')).toBe('platform');
      expect(resolvePortal('127.0.0.1', 'tenant')).toBe('tenant');
    });

    it('defaults to ops when hostname and env are unset', () => {
      expect(resolvePortal('localhost')).toBe('ops');
    });
  });

  describe('isPathAllowedForPortal', () => {
    it('allows platform-only routes on admin hostname portal', () => {
      expect(isPathAllowedForPortal('/tenants', 'platform')).toBe(true);
      expect(isPathAllowedForPortal('/tenants', 'ops')).toBe(false);
      expect(isPathAllowedForPortal('/number-requests', 'platform')).toBe(true);
      expect(isPathAllowedForPortal('/marketplace-reports', 'platform')).toBe(true);
      expect(isPathAllowedForPortal('/trunks', 'platform')).toBe(true);
      expect(isPathAllowedForPortal('/system-health', 'platform')).toBe(true);
      expect(isPathAllowedForPortal('/trunks', 'tenant')).toBe(false);
    });

    it('allows tenant routes on tenant portal', () => {
      expect(isPathAllowedForPortal('/extensions', 'tenant')).toBe(true);
      expect(isPathAllowedForPortal('/extensions', 'platform')).toBe(false);
    });
  });
});
