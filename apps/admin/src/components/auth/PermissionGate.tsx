'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { hasPermission } from '../../lib/rbac/permissions';

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const permissions = usePermissions();
  if (!hasPermission(permissions, permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
