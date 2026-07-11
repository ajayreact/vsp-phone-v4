import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { resolvePortalFromRequest } from '../../lib/portal/portal-routes';
import { PortalShell } from './PortalShell';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const portal = resolvePortalFromRequest({
    forwardedHost: requestHeaders.get('x-forwarded-host'),
    host: requestHeaders.get('host'),
    envPortal: process.env.NEXT_PUBLIC_PORTAL,
  });

  return <PortalShell portal={portal}>{children}</PortalShell>;
}
