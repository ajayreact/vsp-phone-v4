import { ConfigService } from '@nestjs/config';
import { ProvisioningVaultService } from './provisioning-vault.service';

describe('ProvisioningVaultService prov HTTP persistence', () => {
  const mac = 'ec74d751e3e7';

  function buildService(store = new Map<string, string>()) {
    const redis = {
      provHttpCredKey: (m: string) => `vsp:prov:http:${m}`,
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'PROV_HTTP_CREDENTIAL_KEY') return 'test-prov-key';
        return undefined;
      }),
    } as unknown as ConfigService;
    const sipVault = {
      registerPersistentCredential: jest.fn(),
      revokePersistentCredential: jest.fn(),
    };

    const vault = new ProvisioningVaultService(config, sipVault as never, redis as never);
    return { vault, redis, store };
  }

  it('persists credentials on issue and rehydrates after memory loss', async () => {
    const { vault, store } = buildService();

    const issued = await vault.issueProvHttp(mac);
    expect(issued.username).toBe(mac);
    expect(store.has(`vsp:prov:http:${mac}`)).toBe(true);

    (vault as unknown as { provHttp: Map<string, unknown> }).provHttp.clear();

    const rehydrated = await vault.resolveProvHttp(mac);
    expect(rehydrated).toEqual(issued);
  });

  it('reuses existing credentials instead of rotating on issue', async () => {
    const { vault } = buildService();

    const first = await vault.issueProvHttp(mac);
    (vault as unknown as { provHttp: Map<string, unknown> }).provHttp.clear();
    const second = await vault.issueProvHttp(mac);

    expect(second).toEqual(first);
  });

  it('revoke removes persisted credentials', async () => {
    const { vault, store } = buildService();

    await vault.issueProvHttp(mac);
    await vault.revokeProvHttp(mac);

    expect(store.has(`vsp:prov:http:${mac}`)).toBe(false);
    expect(await vault.resolveProvHttp(mac)).toBeNull();
  });
});
