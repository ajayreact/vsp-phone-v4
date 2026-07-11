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
    '/number-marketplace',
    '/number-requests',
    '/marketplace-reports',
    '/carriers',
    '/trunks',
    '/roles',
    '/permissions',
    '/audit-logs',
    '/api-keys',
    '/settings',
    '/system-health',
    '/softphone',
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
    '/softphone',
  ],
  tenant: [
    '/dashboard',
    '/supervisor',
    '/reception',
    '/paging-intercom',
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
    '/softphone',
  ],
};

export function portalFromHostname(hostname: string): PortalType | null {
  const host = hostname.toLowerCase();
  if (host.startsWith('admin.')) return 'platform';
  if (host.startsWith('app.')) return 'ops';
  if (host.startsWith('tenant.')) return 'tenant';
  return null;
}

/**
 * Resolve portal for middleware and SSR.
 * Production uses one admin container behind three hostnames — hostname wins when recognized.
 * NEXT_PUBLIC_PORTAL is a dev fallback (localhost) or legacy per-build deploys.
 */
export function resolvePortal(hostname: string, envPortal?: string): PortalType {
  const fromHost = portalFromHostname(hostname);
  if (fromHost) return fromHost;

  const normalized = envPortal?.trim().toLowerCase();
  if (normalized === 'platform' || normalized === 'ops' || normalized === 'tenant') {
    return normalized;
  }

  return 'ops';
}

/** Strip port from Host / X-Forwarded-Host header value. */
export function hostnameFromHostHeader(hostHeader: string | null | undefined): string {
  if (!hostHeader) return '';
  return hostHeader.split(':')[0]?.trim().toLowerCase() ?? '';
}

function isLoopbackHostname(hostname: string): boolean {
  return !hostname || hostname === '127.0.0.1' || hostname === 'localhost';
}

export type ResolvePortalFromRequestOptions = {
  /** X-Forwarded-Host (highest priority) */
  forwardedHost?: string | null;
  /** Host header */
  host?: string | null;
  /** request.nextUrl.hostname — used only when headers resolve to loopback/absent (local dev) */
  urlHostname?: string | null;
  envPortal?: string;
};

/**
 * Single portal resolver for middleware and SSR layout.
 *
 * Priority:
 * 1. X-Forwarded-Host
 * 2. Host
 * 3. request.nextUrl.hostname (only when headers resolve to loopback or are absent)
 *
 * Production nginx passes Host: admin|app|tenant.vspphone.com — nextUrl hostname (127.0.0.1) is never used.
 */
export function resolvePortalFromRequest(options: ResolvePortalFromRequestOptions): PortalType {
  const fromForwarded = hostnameFromHostHeader(options.forwardedHost);
  const fromHost = hostnameFromHostHeader(options.host);

  let hostname = fromForwarded || fromHost;

  if (isLoopbackHostname(hostname)) {
    const urlHost = hostnameFromHostHeader(options.urlHostname);
    if (urlHost && !isLoopbackHostname(urlHost)) {
      hostname = urlHost;
    } else if (!hostname) {
      hostname = urlHost || 'localhost';
    }
  }

  return resolvePortal(hostname, options.envPortal);
}

/**
 * @deprecated Use resolvePortalFromRequest — kept for call-site clarity where urlHostname is N/A.
 */
export function resolvePortalFromHostHeaders(
  hostHeader: string | null | undefined,
  forwardedHostHeader: string | null | undefined,
  envPortal?: string,
): PortalType {
  return resolvePortalFromRequest({
    host: hostHeader,
    forwardedHost: forwardedHostHeader,
    envPortal,
  });
}

export function isPathAllowedForPortal(pathname: string, portal: PortalType): boolean {
  const path = pathname.split('?')[0] ?? '/';
  if (path === '/' || path === '/login') return true;
  return PORTAL_ROUTE_PREFIXES[portal].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
