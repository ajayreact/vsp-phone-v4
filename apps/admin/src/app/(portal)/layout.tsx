import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { resolvePortal } from '../../lib/portal/portal-routes';
import { PortalShell } from './PortalShell';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const hostHeader = (await headers()).get('host') ?? '';
  const hostname = hostHeader.split(':')[0] ?? '';
  const portal = resolvePortal(hostname, process.env.NEXT_PUBLIC_PORTAL);

  return <PortalShell portal={portal}>{children}</PortalShell>;
}
