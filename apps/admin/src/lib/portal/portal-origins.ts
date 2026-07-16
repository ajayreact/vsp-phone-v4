/** Cross-portal URLs for impersonation handoff. */

export function tenantPortalOrigin(): string {
  if (typeof window === 'undefined') return '';
  const env = (process.env.NEXT_PUBLIC_TENANT_PORTAL_URL || '').replace(/\/$/, '');
  if (env) return env;
  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';
  if (hostname.startsWith('admin.')) {
    return `${protocol}//${hostname.replace(/^admin\./, 'tenant.')}${portPart}`;
  }
  if (hostname.startsWith('app.')) {
    return `${protocol}//${hostname.replace(/^app\./, 'tenant.')}${portPart}`;
  }
  return `${protocol}//${hostname}${portPart}`;
}

export function platformPortalOrigin(): string {
  if (typeof window === 'undefined') return '';
  const env = (process.env.NEXT_PUBLIC_PLATFORM_PORTAL_URL || '').replace(/\/$/, '');
  if (env) return env;
  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';
  if (hostname.startsWith('tenant.')) {
    return `${protocol}//${hostname.replace(/^tenant\./, 'admin.')}${portPart}`;
  }
  if (hostname.startsWith('app.')) {
    return `${protocol}//${hostname.replace(/^app\./, 'admin.')}${portPart}`;
  }
  return `${protocol}//${hostname}${portPart}`;
}
