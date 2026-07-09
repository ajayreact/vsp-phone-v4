'use client';

import type { ReactNode } from 'react';
import { RequireAuth } from '../../components/auth/RequireAuth';
import { PortalShell } from '../../components/layout/PortalShell';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <PortalShell>{children}</PortalShell>
    </RequireAuth>
  );
}
