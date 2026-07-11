'use client';

import { usePortal } from '../../lib/portal/PortalProvider';
import { OpsCenterDashboard } from './OpsCenterDashboard';
import { PlatformDashboardContent } from './PlatformDashboardContent';
import { TenantDashboardContent } from './TenantDashboardContent';

export function PortalDashboard() {
  const portal = usePortal();
  if (portal === 'platform') return <PlatformDashboardContent />;
  if (portal === 'tenant') return <TenantDashboardContent />;
  return <OpsCenterDashboard />;
}
