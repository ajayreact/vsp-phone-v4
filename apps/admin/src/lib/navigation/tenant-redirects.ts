/** Legacy tenant routes → Tenant Portal V2 paths (applied when V2 is enabled). */
export const TENANT_LEGACY_REDIRECTS: Record<string, string> = {
  '/dids': '/extensions',
  '/users': '/people/users',
  '/extensions': '/extensions',
  '/people/extensions': '/extensions',
  '/people/provision': '/extensions',
  '/number-requests': '/phone-numbers/requests',
  '/call-routing': '/call-flow/incoming-routes',
  '/ring-groups': '/call-flow/ring-groups',
  '/queues': '/call-flow/queues',
  '/ivr': '/call-flow/ivr',
  '/conferences': '/communication/conferences',
  '/voicemail': '/communication/voicemail',
  '/paging-intercom': '/communication/paging',
  '/audio-library': '/communication/music-on-hold',
  '/cdr': '/reports/cdr',
  '/call-recordings': '/communication/recordings',
  '/reports/recordings': '/communication/recordings',
  '/reports': '/reports/analytics',
  '/settings': '/settings/pbx',
  '/organization': '/settings/company',
  '/organization/company': '/settings/company',
  '/organization/sites': '/settings/sites',
  '/organization/departments': '/settings/departments',
  '/supervisor': '/contact-center/supervisor',
  '/reception': '/contact-center/reception',
  '/sip-accounts': '/extensions',
  '/provisioning': '/extensions',
  '/phone-numbers/routing': '/phone-numbers/my-numbers',
  '/api-keys': '/settings/api-keys',
  '/call-flow/routing': '/phone-numbers/my-numbers',
};

export function resolveTenantLegacyRedirect(pathname: string): string | null {
  const path = pathname.split('?')[0] ?? '/';
  if (TENANT_LEGACY_REDIRECTS[path]) return TENANT_LEGACY_REDIRECTS[path];
  for (const [legacy, target] of Object.entries(TENANT_LEGACY_REDIRECTS)) {
    if (path.startsWith(`${legacy}/`)) {
      return target + path.slice(legacy.length);
    }
  }
  return null;
}
