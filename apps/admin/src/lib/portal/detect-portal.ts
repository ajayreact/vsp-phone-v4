export type PortalType = 'platform' | 'ops' | 'tenant';

const PORTAL_LABELS: Record<PortalType, string> = {
  platform: 'Platform Admin',
  ops: 'Operations Center',
  tenant: 'Tenant Portal',
};

function portalFromHostname(hostname: string): PortalType | null {
  const host = hostname.toLowerCase();
  if (host.startsWith('admin.')) return 'platform';
  if (host.startsWith('app.')) return 'ops';
  if (host.startsWith('tenant.')) return 'tenant';
  return null;
}

/** Resolve active portal from hostname or NEXT_PUBLIC_PORTAL env. */
export function detectPortal(): PortalType {
  const envPortal = process.env.NEXT_PUBLIC_PORTAL?.trim().toLowerCase();
  if (envPortal === 'platform' || envPortal === 'ops' || envPortal === 'tenant') {
    return envPortal;
  }

  if (typeof window !== 'undefined') {
    const fromHost = portalFromHostname(window.location.hostname);
    if (fromHost) return fromHost;
  }

  return 'ops';
}

export function getPortalLabel(portal?: PortalType): string {
  return PORTAL_LABELS[portal ?? detectPortal()];
}
