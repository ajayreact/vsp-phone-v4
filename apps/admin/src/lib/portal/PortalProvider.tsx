'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PortalType } from './detect-portal';
import { resolvePortal } from './portal-routes';

const PortalContext = createContext<PortalType | null>(null);

export function PortalProvider({
  portal,
  children,
}: {
  portal: PortalType;
  children: ReactNode;
}) {
  return <PortalContext.Provider value={portal}>{children}</PortalContext.Provider>;
}

/** Active portal from server hostname (SSR-safe) or hostname/env fallback. */
export function usePortal(): PortalType {
  const fromContext = useContext(PortalContext);
  if (fromContext) return fromContext;

  if (typeof window !== 'undefined') {
    return resolvePortal(window.location.hostname, process.env.NEXT_PUBLIC_PORTAL);
  }

  return resolvePortal('', process.env.NEXT_PUBLIC_PORTAL);
}
