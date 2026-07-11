'use client';

import type { ReactNode } from 'react';
import { RequireAuth } from '../../components/auth/RequireAuth';
import { AppShell } from '../../components/layout/AppShell';
import type { PortalType } from '../../lib/portal/detect-portal';
import { PortalProvider } from '../../lib/portal/PortalProvider';

export function PortalShell({
  portal,
  children,
}: {
  portal: PortalType;
  children: ReactNode;
}) {
  return (
    <PortalProvider portal={portal}>
      <RequireAuth>
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </PortalProvider>
  );
}
