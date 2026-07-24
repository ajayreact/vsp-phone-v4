import { ConfigService } from '@nestjs/config';
import { SipCredentialVaultService } from './sip-credential-vault.service';
import { computeHa1 } from './sip-digest.crypto';

describe('SipCredentialVaultService desk digest', () => {
  it('recomputes HA1 for challenge realm when desk password is retained', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null) };
    const config = {
      get: jest.fn((_key: string, fallback?: string) => fallback ?? ''),
    } as unknown as ConfigService;

    const vault = new SipCredentialVaultService(config, redis as never);
    vault.registerPersistentCredential({
      sipEndpointId: 'ep-1',
      authUsername: '100',
      realm: 'vsp-internal.sip.vspphone.com',
      password: 'desk-secret',
      version: 'desk-1',
      retainPassword: true,
    });

    const cred = await vault.resolveHa1({
      sipEndpointId: 'ep-1',
      authUsername: '100',
      realm: 'sip.vspphone.com',
    });

    expect(cred?.ha1).toBe(computeHa1('100', 'sip.vspphone.com', 'desk-secret'));
  });

  it('prefers retained password over stale user@registrar HA1', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null) };
    const config = {
      get: jest.fn((_key: string, fallback?: string) => fallback ?? ''),
    } as unknown as ConfigService;

    const vault = new SipCredentialVaultService(config, redis as never);
    // Stale HA1 for challenge realm (old password)
    (vault as unknown as { map: Map<string, unknown> }).map.set('100@sip.vspphone.com', {
      ha1: computeHa1('100', 'sip.vspphone.com', 'old-password'),
      version: 'old',
    });
    vault.registerPersistentCredential({
      sipEndpointId: 'ep-1',
      authUsername: '100',
      realm: 'vsp-internal.sip.vspphone.com',
      password: 'new-password',
      version: 'desk-2',
      retainPassword: true,
    });

    const cred = await vault.resolveHa1({
      sipEndpointId: 'ep-1',
      authUsername: '100',
      realm: 'sip.vspphone.com',
    });

    expect(cred?.ha1).toBe(computeHa1('100', 'sip.vspphone.com', 'new-password'));
  });
});
