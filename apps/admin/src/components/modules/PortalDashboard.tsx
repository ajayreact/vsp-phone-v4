'use client';

import { usePortal } from '../../lib/portal/PortalProvider';
import { isTenantPortalV2Enabled } from '../../lib/feature-flags';
import { OpsCenterDashboard } from './OpsCenterDashboard';
import { PlatformDashboardContent } from './PlatformDashboardContent';
import { TenantDashboardContent } from './TenantDashboardContent';
import { TenantDashboardV2Content } from './TenantDashboardV2Content';

export function PortalDashboard() {
  const portal = usePortal();
  if (portal === 'platform') return <PlatformDashboardContent />;
  if (portal === 'tenant') {
    return isTenantPortalV2Enabled() ? <TenantDashboardV2Content /> : <TenantDashboardContent />;
  }
  return <OpsCenterDashboard />;
}
