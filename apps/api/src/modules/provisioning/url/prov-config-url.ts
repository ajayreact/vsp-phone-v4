import { normalizeMac } from '../vault/provisioning-vault.service';

/** Vendor path segment for provisioning edge URLs (ADR-042). */
export const PROV_VENDOR_PATHS: Record<string, string> = {
  GRANDSTREAM: 'gs',
  YEALINK: 'yealink',
  FANVIL: 'fanvil',
  POLY: 'poly',
  CISCO: 'cisco',
  SNOM: 'snom',
  OTHER: 'sip',
};

export const PROV_SUPPORTED_VENDORS = [
  { manufacturer: 'GRANDSTREAM', label: 'Grandstream', path: 'gs', examplePath: '/gs/{mac}/cfg.xml' },
  { manufacturer: 'YEALINK', label: 'Yealink', path: 'yealink', examplePath: '/yealink/{mac}/cfg.xml' },
  { manufacturer: 'FANVIL', label: 'Fanvil', path: 'fanvil', examplePath: '/fanvil/{mac}/cfg.xml' },
  { manufacturer: 'CISCO', label: 'Cisco', path: 'cisco', examplePath: '/cisco/{mac}/cfg.xml' },
  { manufacturer: 'POLY', label: 'Poly', path: 'poly', examplePath: '/poly/{mac}/cfg.xml' },
  { manufacturer: 'SNOM', label: 'Snom', path: 'snom', examplePath: '/snom/{mac}/cfg.xml' },
] as const;

export function provVendorPath(manufacturer: string | null | undefined): string {
  const key = String(manufacturer ?? 'GRANDSTREAM').toUpperCase();
  return PROV_VENDOR_PATHS[key] ?? 'gs';
}

export function resolveProvPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.PROV_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (configured) return configured;

  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  const vspEnv = (env.VSP_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production' || vspEnv === 'production') {
    return 'https://prov.vspphone.com';
  }

  const port = env.PROV_HTTPS_PORT ?? '3444';
  return `https://prov.localhost:${port}`;
}

/**
 * Build canonical config URL: `{base}/{vendor}/{mac12}/cfg.xml`
 * MAC is normalized to lowercase 12 hex digits (ADR-042).
 */
export function buildProvConfigUrl(
  manufacturer: string | null | undefined,
  mac: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!mac?.trim()) return null;
  const mac12 = normalizeMac(mac);
  if (mac12.length !== 12) return null;
  const base = resolveProvPublicBaseUrl(env);
  const vendor = provVendorPath(manufacturer);
  return `${base}/${vendor}/${mac12}/cfg.xml`;
}
