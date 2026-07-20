import { resolveTenantLegacyRedirect } from './tenant-redirects';

describe('resolveTenantLegacyRedirect', () => {
  it('redirects exact /settings to /settings/company once', () => {
    expect(resolveTenantLegacyRedirect('/settings')).toBe('/settings/company');
  });

  it('does not rewrite canonical settings children (no /pbx/pbx loop)', () => {
    expect(resolveTenantLegacyRedirect('/settings/pbx')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/pbx/security')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/security')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/api-keys')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/company')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/business-hours')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/branding')).toBeNull();
    expect(resolveTenantLegacyRedirect('/settings/danger-zone')).toBe('/settings/security');
  });

  it('does not rewrite /reports children into /reports/analytics/...', () => {
    expect(resolveTenantLegacyRedirect('/reports')).toBe('/reports/analytics');
    expect(resolveTenantLegacyRedirect('/reports/cdr')).toBeNull();
    expect(resolveTenantLegacyRedirect('/reports/analytics')).toBeNull();
  });

  it('rewrites true legacy organization paths', () => {
    expect(resolveTenantLegacyRedirect('/organization')).toBe('/settings/company');
    expect(resolveTenantLegacyRedirect('/organization/sites')).toBe('/settings/sites');
  });

  it('rewrites legacy /dids prefix onto /extensions', () => {
    expect(resolveTenantLegacyRedirect('/dids')).toBe('/extensions');
    expect(resolveTenantLegacyRedirect('/dids/foo')).toBe('/extensions/foo');
  });
});
