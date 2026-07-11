export type PortalType = 'platform' | 'ops' | 'tenant';

const PORTAL_LABELS: Record<PortalType, string> = {
  platform: 'Platform Admin',
  ops: 'Operations Center',
  tenant: 'Tenant Portal',
};

import { resolvePortal } from './portal-routes';

/** Resolve portal outside React (prefer usePortal() in client components). */
export function detectPortal(hostname?: string): PortalType {
  const host =
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return resolvePortal(host, process.env.NEXT_PUBLIC_PORTAL);
}

export function getPortalLabel(portal?: PortalType): string {
  return PORTAL_LABELS[portal ?? detectPortal()];
}
