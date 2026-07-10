'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { hasPermission } from '../../lib/rbac/permissions';
import { getModuleById } from '../../lib/navigation';
import { EmptyState } from '../data/EmptyState';
import { IntegrationBadge } from '../data/IntegrationBadge';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';

export function ModulePage({
  moduleId,
  children,
}: {
  moduleId: string;
  children?: ReactNode;
}) {
  const module = getModuleById(moduleId);
  const permissions = usePermissions();

  if (!module) {
    return (
      <PageContainer>
        <EmptyState title="Module not found" description={`Unknown module: ${moduleId}`} />
      </PageContainer>
    );
  }

  const allowed = hasPermission(permissions, module.permission);

  if (!allowed) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={module.label}
        description={module.description}
        actions={<IntegrationBadge status={module.integration} />}
      />
      {children ?? (
        <EmptyState
          title={`${module.label} is not configured`}
          description="This module does not have a dedicated view in this portal build."
        />
      )}
    </PageContainer>
  );
}
