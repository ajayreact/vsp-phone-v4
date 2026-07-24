import { ConfigService } from '@nestjs/config';
import { SipCredentialVaultService } from './sip-credential-vault.service';
import { computeHa1 } from './sip-digest.crypto';

describe('SipCredentialVaultService desk digest', () => {
  function buildVault() {
    const redis = { get: jest.fn().mockResolvedValue(null) };
    const config = {
      get: jest.fn((_key: string, fallback?: string) => fallback ?? ''),
    } as unknown as ConfigService;
    return new SipCredentialVaultService(config, redis as never);
  }

  it('recomputes HA1 for challenge realm when desk password is retained', async () => {
    const vault = buildVault();
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
    expect(cred?.source).toBe('redis');
  });

  it('prefers retained password over stale user@registrar HA1', async () => {
    const vault = buildVault();
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
    expect(cred?.source).toBe('redis');
  });

  it('never lets enroll overlay win resolveHa1 when desk Redis password exists', async () => {
    const vault = buildVault();
    vault.registerPersistentCredential({
      sipEndpointId: 'ep-shared',
      authUsername: '100',
      realm: 'sip.vspphone.com',
      password: 'desk-secret',
      version: 'desk-9',
      retainPassword: true,
    });
    vault.registerEnrollCredential({
      sipEndpointId: 'ep-shared',
      authUsername: '100',
      realm: 'vsp-internal.sip.vspphone.com',
      password: 'enroll-secret',
      ttlSec: 900,
      version: 'enroll-abc',
    });

    const primary = await vault.resolveHa1({
      sipEndpointId: 'ep-shared',
      authUsername: '100',
      realm: 'sip.vspphone.com',
    });
    const candidates = await vault.resolveHa1Candidates({
      sipEndpointId: 'ep-shared',
      authUsername: '100',
      realm: 'sip.vspphone.com',
    });

    expect(primary?.source).toBe('redis');
    expect(primary?.passwordVersion).toBe('desk-9');
    expect(candidates.map((c) => c.source)).toEqual(['redis', 'enroll']);
    expect(candidates[0]?.passwordVersion).toBe('desk-9');
    expect(candidates[1]?.passwordVersion).toBe('enroll-abc');
  });
});
