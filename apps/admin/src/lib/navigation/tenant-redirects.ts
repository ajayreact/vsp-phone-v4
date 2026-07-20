/** Legacy tenant routes → Tenant Portal V2 paths (applied when V2 is enabled). */
export const TENANT_LEGACY_REDIRECTS: Record<string, string> = {
  '/dids': '/extensions',
  '/devices': '/people/devices',
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
  '/settings': '/settings/company',
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
  '/settings/danger-zone': '/settings/security',
  '/call-flow/routing': '/phone-numbers/my-numbers',
};

/**
 * Resolve a one-shot legacy → V2 redirect.
 * Never builds child routes from the current pathname in a way that can loop
 * (e.g. /settings/pbx → /settings/pbx/pbx).
 */
export function resolveTenantLegacyRedirect(pathname: string): string | null {
  const path = pathname.split('?')[0] ?? '/';

  const exact = TENANT_LEGACY_REDIRECTS[path];
  if (exact) return exact === path ? null : exact;

  // Longest legacy prefix first so /organization/company wins over /organization.
  const entries = Object.entries(TENANT_LEGACY_REDIRECTS).sort((a, b) => b[0].length - a[0].length);

  for (const [legacy, target] of entries) {
    if (!path.startsWith(`${legacy}/`)) continue;

    // Already under the redirect target — stop (prevents /settings/pbx → /settings/pbx/pbx).
    if (path === target || path.startsWith(`${target}/`)) return null;

    // Target is a child of legacy (e.g. /settings → /settings/pbx). Deeper paths like
    // /settings/security are already canonical V2 routes — do not rewrite them.
    if (target.startsWith(`${legacy}/`)) return null;

    const rewritten = target + path.slice(legacy.length);
    if (rewritten === path) return null;
    return rewritten;
  }

  return null;
}
