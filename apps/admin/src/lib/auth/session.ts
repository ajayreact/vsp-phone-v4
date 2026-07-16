import { detectPortal } from '../portal/detect-portal';
import type { PortalType } from '../portal/detect-portal';

function accessKey(portal?: PortalType): string {
  const p = portal ?? detectPortal();
  return `vsp.${p}.accessToken`;
}

function refreshKey(portal?: PortalType): string {
  const p = portal ?? detectPortal();
  return `vsp.${p}.refreshToken`;
}

/** Legacy unscoped keys — migrated on read. */
const LEGACY_ACCESS = 'vsp.accessToken';
const LEGACY_REFRESH = 'vsp.refreshToken';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const scoped = sessionStorage.getItem(accessKey());
  if (scoped) return scoped;
  const legacy = sessionStorage.getItem(LEGACY_ACCESS);
  if (legacy) {
    sessionStorage.setItem(accessKey(), legacy);
    sessionStorage.removeItem(LEGACY_ACCESS);
    return legacy;
  }
  return null;
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(accessKey(), token);
  sessionStorage.removeItem(LEGACY_ACCESS);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  const scoped = localStorage.getItem(refreshKey());
  if (scoped) return scoped;
  const legacy = localStorage.getItem(LEGACY_REFRESH);
  if (legacy) {
    localStorage.setItem(refreshKey(), legacy);
    localStorage.removeItem(LEGACY_REFRESH);
    return legacy;
  }
  return null;
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(refreshKey(), token);
  localStorage.removeItem(LEGACY_REFRESH);
}

export function clearSessionTokens(): void {
  sessionStorage.removeItem(accessKey());
  localStorage.removeItem(refreshKey());
  sessionStorage.removeItem(LEGACY_ACCESS);
  localStorage.removeItem(LEGACY_REFRESH);
}
