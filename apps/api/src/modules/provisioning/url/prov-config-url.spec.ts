import {
  PROV_SUPPORTED_VENDORS,
  buildProvConfigUrl,
  provVendorPath,
  resolveProvPublicBaseUrl,
} from './prov-config-url';

describe('prov-config-url', () => {
  const prodEnv = {
    NODE_ENV: 'production',
    VSP_ENV: 'production',
    PROV_PUBLIC_BASE_URL: '',
  } as NodeJS.ProcessEnv;

  it('defaults production base URL to https://prov.vspphone.com', () => {
    expect(resolveProvPublicBaseUrl(prodEnv)).toBe('https://prov.vspphone.com');
  });

  it('uses PROV_PUBLIC_BASE_URL when set', () => {
    expect(
      resolveProvPublicBaseUrl({
        ...prodEnv,
        PROV_PUBLIC_BASE_URL: 'https://prov.example.com/',
      }),
    ).toBe('https://prov.example.com');
  });

  it('maps all supported vendors to path segments', () => {
    expect(provVendorPath('GRANDSTREAM')).toBe('gs');
    expect(provVendorPath('YEALINK')).toBe('yealink');
    expect(provVendorPath('FANVIL')).toBe('fanvil');
    expect(provVendorPath('CISCO')).toBe('cisco');
    expect(provVendorPath('POLY')).toBe('poly');
    expect(provVendorPath('SNOM')).toBe('snom');
  });

  it('builds canonical cfg.xml URLs from manufacturer + MAC', () => {
    const mac = '00:0B:82:0A:12:34';
    expect(buildProvConfigUrl('GRANDSTREAM', mac, prodEnv)).toBe(
      'https://prov.vspphone.com/gs/000b820a1234/cfg.xml',
    );
    expect(buildProvConfigUrl('YEALINK', mac, prodEnv)).toBe(
      'https://prov.vspphone.com/yealink/000b820a1234/cfg.xml',
    );
    expect(buildProvConfigUrl('FANVIL', mac, prodEnv)).toBe(
      'https://prov.vspphone.com/fanvil/000b820a1234/cfg.xml',
    );
    expect(buildProvConfigUrl('CISCO', mac, prodEnv)).toBe(
      'https://prov.vspphone.com/cisco/000b820a1234/cfg.xml',
    );
    expect(buildProvConfigUrl('POLY', mac, prodEnv)).toBe(
      'https://prov.vspphone.com/poly/000b820a1234/cfg.xml',
    );
    expect(buildProvConfigUrl('SNOM', mac, prodEnv)).toBe(
      'https://prov.vspphone.com/snom/000b820a1234/cfg.xml',
    );
  });

  it('returns null when MAC is missing or invalid', () => {
    expect(buildProvConfigUrl('GRANDSTREAM', null, prodEnv)).toBeNull();
    expect(buildProvConfigUrl('GRANDSTREAM', 'not-a-mac', prodEnv)).toBeNull();
    expect(buildProvConfigUrl('GRANDSTREAM', '00:0B:82', prodEnv)).toBeNull();
  });

  it('lists six primary vendors with example paths', () => {
    expect(PROV_SUPPORTED_VENDORS).toHaveLength(6);
    expect(PROV_SUPPORTED_VENDORS.map((v) => v.manufacturer)).toEqual([
      'GRANDSTREAM',
      'YEALINK',
      'FANVIL',
      'CISCO',
      'POLY',
      'SNOM',
    ]);
  });
});
