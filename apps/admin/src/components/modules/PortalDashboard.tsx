'use client';

import { detectPortal } from '../../lib/portal/detect-portal';
import { OpsCenterDashboard } from './OpsCenterDashboard';
import { PlatformDashboardContent } from './PlatformDashboardContent';
import { TenantDashboardContent } from './TenantDashboardContent';

export function PortalDashboard() {
  const portal = detectPortal();
  if (portal === 'platform') return <PlatformDashboardContent />;
  if (portal === 'tenant') return <TenantDashboardContent />;
  return <OpsCenterDashboard />;
}
