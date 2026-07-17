'use client';

import { usePortal } from '../../lib/portal/PortalProvider';
import { OpsCenterDashboard } from './OpsCenterDashboard';
import { PlatformDashboardContent } from './PlatformDashboardContent';
import { TenantDashboardV2Content } from './TenantDashboardV2Content';

export function PortalDashboard() {
  const portal = usePortal();
  if (portal === 'platform') return <PlatformDashboardContent />;
  if (portal === 'tenant') return <TenantDashboardV2Content />;
  return <OpsCenterDashboard />;
}
