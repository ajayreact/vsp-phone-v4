import {
  isPathAllowedForPortal,
  portalFromHostname,
  resolvePortal,
  resolvePortalFromHostHeaders,
  resolvePortalFromRequest,
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

  describe('resolvePortalFromRequest', () => {
    it('prefers X-Forwarded-Host over Host', () => {
      expect(
        resolvePortalFromRequest({
          forwardedHost: 'admin.vspphone.com',
          host: '127.0.0.1:3001',
          urlHostname: '127.0.0.1',
        }),
      ).toBe('platform');
    });

    it('uses Host when upstream URL hostname is 127.0.0.1 (nginx proxy)', () => {
      expect(
        resolvePortalFromRequest({
          host: 'admin.vspphone.com',
          urlHostname: '127.0.0.1',
          envPortal: 'ops',
        }),
      ).toBe('platform');
      expect(
        resolvePortalFromRequest({
          host: 'app.vspphone.com',
          urlHostname: '127.0.0.1',
        }),
      ).toBe('ops');
      expect(
        resolvePortalFromRequest({
          host: 'tenant.vspphone.com',
          urlHostname: '127.0.0.1',
        }),
      ).toBe('tenant');
    });

    it('never uses urlHostname when Host is a production vhost', () => {
      expect(
        resolvePortalFromRequest({
          host: 'admin.vspphone.com',
          urlHostname: 'app.vspphone.com',
        }),
      ).toBe('platform');
    });

    it('resolves from Host even when urlHostname is loopback (curl / nginx proxy)', () => {
      expect(
        resolvePortalFromRequest({
          host: 'admin.vspphone.com',
          urlHostname: '127.0.0.1',
          envPortal: 'ops',
        }),
      ).toBe('platform');
    });

    it('resolves from urlHostname when Host is loopback but nextUrl has vhost', () => {
      expect(
        resolvePortalFromRequest({
          host: '127.0.0.1:3001',
          urlHostname: 'admin.vspphone.com',
          envPortal: 'ops',
        }),
      ).toBe('platform');
    });

    it('middleware and SSR resolve identically for nginx production headers', () => {
      const headers = { host: 'admin.vspphone.com', forwardedHost: null as string | null };
      const middlewarePortal = resolvePortalFromRequest({
        forwardedHost: headers.forwardedHost,
        host: headers.host,
        urlHostname: '127.0.0.1',
      });
      const ssrPortal = resolvePortalFromRequest({
        forwardedHost: headers.forwardedHost,
        host: headers.host,
      });
      expect(middlewarePortal).toBe('platform');
      expect(ssrPortal).toBe('platform');
      expect(middlewarePortal).toBe(ssrPortal);
    });

    it('falls back to env portal on localhost Host', () => {
      expect(
        resolvePortalFromRequest({
          host: 'localhost:3001',
          urlHostname: 'localhost',
          envPortal: 'platform',
        }),
      ).toBe('platform');
    });
  });

  describe('resolvePortalFromHostHeaders (alias)', () => {
    it('matches resolvePortalFromRequest without urlHostname', () => {
      expect(resolvePortalFromHostHeaders('admin.vspphone.com', null, 'ops')).toBe('platform');
    });
  });

  describe('isPathAllowedForPortal', () => {
    const platformRoutes = [
      '/dashboard',
      '/tenants',
      '/organization',
      '/users',
      '/roles',
      '/permissions',
      '/api-keys',
      '/settings',
      '/provisioning-settings',
      '/telnyx-numbers',
      '/number-marketplace',
      '/number-requests',
      '/carriers',
      '/trunks',
      '/billing',
      '/audit-logs',
      '/marketplace-reports',
      '/system-health',
    ];

    it.each(platformRoutes)('allows %s on platform portal', (path) => {
      expect(isPathAllowedForPortal(path, 'platform')).toBe(true);
    });

    it('blocks platform-only routes on ops portal', () => {
      expect(isPathAllowedForPortal('/tenants', 'ops')).toBe(false);
      expect(isPathAllowedForPortal('/number-requests', 'ops')).toBe(false);
    });

    it('allows tenant routes on tenant portal', () => {
      expect(isPathAllowedForPortal('/extensions', 'tenant')).toBe(true);
      expect(isPathAllowedForPortal('/extensions', 'platform')).toBe(false);
    });
  });
});
