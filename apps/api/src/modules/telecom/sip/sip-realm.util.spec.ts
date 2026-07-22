import { isAcceptedDigestRealm, tenantSipRealm } from './sip-realm.util';

describe('sip-realm.util', () => {
  const aor = 'sip:100@vsp-internal.sip.vspphone.com';

  it('accepts tenant SIP realm', () => {
    expect(
      isAcceptedDigestRealm({
        realm: 'vsp-internal.sip.vspphone.com',
        tenantSlug: 'vsp-internal',
        platformDomain: 'vspphone.com',
        endpointAor: aor,
      }),
    ).toBe(true);
  });

  it('accepts platform domain', () => {
    expect(
      isAcceptedDigestRealm({
        realm: 'vspphone.com',
        tenantSlug: 'vsp-internal',
        platformDomain: 'vspphone.com',
        endpointAor: aor,
      }),
    ).toBe(true);
  });

  it('accepts shared registrar host when configured', () => {
    expect(
      isAcceptedDigestRealm({
        realm: 'sip.vspphone.com',
        tenantSlug: 'vsp-internal',
        platformDomain: 'vspphone.com',
        endpointAor: aor,
        registrarHost: 'sip.vspphone.com',
      }),
    ).toBe(true);
  });

  it('rejects registrar host when not configured', () => {
    expect(
      isAcceptedDigestRealm({
        realm: 'sip.vspphone.com',
        tenantSlug: 'vsp-internal',
        platformDomain: 'vspphone.com',
        endpointAor: aor,
      }),
    ).toBe(false);
  });

  it('builds tenant realm', () => {
    expect(tenantSipRealm('acme', 'vspphone.com')).toBe('acme.sip.vspphone.com');
  });
});
