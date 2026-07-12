/** Client-safe feature flags (NEXT_PUBLIC_*). */

export function isTenantPortalV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_TENANT_PORTAL_V2 === 'true';
}

export function isTenantPortalV2NavEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_TENANT_PORTAL_V2_NAV === 'false') return false;
  return isTenantPortalV2Enabled() || process.env.NEXT_PUBLIC_TENANT_PORTAL_V2_NAV === 'true';
}

/** Extension-first hub landing and navigation (default on). */
export function isExtensionHubEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EXTENSION_HUB !== 'false';
}
