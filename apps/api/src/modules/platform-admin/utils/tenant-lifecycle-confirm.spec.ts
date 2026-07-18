import {
  assertConfirmPhrase,
  expectedConfirmPhrase,
  isProtectedTenantSlug,
} from './tenant-lifecycle-confirm';

describe('tenant-lifecycle-confirm', () => {
  it('builds exact confirmation phrases', () => {
    expect(expectedConfirmPhrase('reset_pbx', 'Acme Corp')).toBe('RESET PBX Acme Corp');
    expect(expectedConfirmPhrase('reset_tenant', 'Acme Corp')).toBe('RESET Acme Corp');
    expect(expectedConfirmPhrase('factory_reset', 'Acme Corp')).toBe('RESET Acme Corp');
    expect(expectedConfirmPhrase('delete', 'Acme Corp')).toBe('DELETE Acme Corp');
  });

  it('accepts matching phrases and rejects mismatches', () => {
    expect(() => assertConfirmPhrase('reset_pbx', 'Demo', 'RESET PBX Demo')).not.toThrow();
    expect(() => assertConfirmPhrase('reset_tenant', 'Demo', 'RESET Demo')).not.toThrow();
    expect(() => assertConfirmPhrase('delete', 'Demo', 'DELETE Demo')).not.toThrow();
    expect(() => assertConfirmPhrase('reset_tenant', 'Demo', 'FACTORY RESET Demo')).toThrow(
      /Confirmation phrase mismatch/,
    );
    expect(() => assertConfirmPhrase('reset_pbx', 'Demo', 'RESET PBX')).toThrow(/Confirmation phrase mismatch/);
  });

  it('blocks inventory / platform tenant slugs', () => {
    expect(isProtectedTenantSlug('platform')).toBe(true);
    expect(isProtectedTenantSlug('inventory')).toBe(true);
    expect(isProtectedTenantSlug('platform-inventory')).toBe(true);
    expect(isProtectedTenantSlug('vsp-internal')).toBe(true);
    expect(isProtectedTenantSlug('acme')).toBe(false);
  });
});
