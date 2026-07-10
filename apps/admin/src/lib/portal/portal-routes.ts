import type { PortalType } from './detect-portal';

/** Route prefixes allowed per portal hostname (server-safe, no icon imports). */
export const PORTAL_ROUTE_PREFIXES: Record<PortalType, string[]> = {
  platform: [
    '/dashboard',
    '/tenants',
    '/organization',
    '/users',
    '/billing',
    '/telnyx-numbers',
    '/carriers',
    '/roles',
    '/permissions',
    '/audit-logs',
    '/api-keys',
    '/settings',
  ],
  ops: [
    '/dashboard',
    '/telecom-noc',
    '/supervisor',
    '/live-calls',
    '/system-health',
    '/kamailio',
    '/rtpengine',
    '/redis',
    '/postgresql',
    '/trunks',
    '/sip-accounts',
    '/carriers',
    '/audit-logs',
  ],
  tenant: [
    '/dashboard',
    '/supervisor',
    '/reception',
    '/organization',
    '/users',
    '/extensions',
    '/devices',
    '/sip-accounts',
    '/provisioning',
    '/dids',
    '/call-routing',
    '/ring-groups',
    '/queues',
    '/ivr',
    '/audio-library',
    '/voicemail',
    '/conferences',
    '/cdr',
    '/call-recordings',
    '/reports',
    '/settings',
  ],
};

export function portalFromHostname(hostname: string): PortalType | null {
  const host = hostname.toLowerCase();
  if (host.startsWith('admin.')) return 'platform';
  if (host.startsWith('app.')) return 'ops';
  if (host.startsWith('tenant.')) return 'tenant';
  return null;
}

export function resolvePortal(hostname: string, envPortal?: string): PortalType {
  const normalized = envPortal?.trim().toLowerCase();
  if (normalized === 'platform' || normalized === 'ops' || normalized === 'tenant') {
    return normalized;
  }
  return portalFromHostname(hostname) ?? 'ops';
}

export function isPathAllowedForPortal(pathname: string, portal: PortalType): boolean {
  const path = pathname.split('?')[0] ?? '/';
  if (path === '/' || path === '/login') return true;
  return PORTAL_ROUTE_PREFIXES[portal].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
