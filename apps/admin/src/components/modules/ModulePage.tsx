'use client';

import type { ReactNode } from 'react';
import { PermissionGate } from '../auth/PermissionGate';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { hasPermission } from '../../lib/rbac/permissions';
import { getModuleById } from '../../lib/navigation';
import type { ModuleDefinition } from '../../types/navigation';
import { IntegrationBadge } from '../data/IntegrationBadge';
import { PermissionDenied } from '../data/PermissionDenied';
import { EmptyState } from '../data/EmptyState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';

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
      {children ?? <ModulePlaceholder module={module} />}
    </PageContainer>
  );
}

function ModulePlaceholder({ module }: { module: ModuleDefinition }) {
  if (module.integration === 'live') {
    return (
      <PermissionGate permission={module.permission}>
        <EmptyState
          title={`${module.label} module ready`}
          description="The API integration is live. Module-specific data views will load here as features are connected."
          action={<Button variant="secondary">Refresh</Button>}
        />
      </PermissionGate>
    );
  }

  if (module.integration === 'bff') {
    return (
      <Card>
        <CardHeader title="Platform operations (BFF)" description="Data proxied server-side with service authentication." />
        <CardBody className="space-y-4 text-sm text-muted-foreground">
          <p>
            This infrastructure module requires <code className="rounded bg-muted px-1">platform:super_admin</code>{' '}
            and loads metrics via Next.js BFF routes.
          </p>
          {module.apiEndpoints?.length ? (
            <ul className="list-disc pl-5">
              {module.apiEndpoints.map((ep) => (
                <li key={ep}>{ep}</li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Module scaffold" description="Enterprise UI shell — backend CRUD API pending." />
        <CardBody>
          <EmptyState
            title={`${module.label} administration`}
            description="Prisma models and domain boundaries exist. REST controllers will be added in the next API phase. This page provides navigation, RBAC, and layout integration today."
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Data model" />
        <CardBody className="space-y-3 text-sm">
          {module.prismaModels?.length ? (
            <ul className="space-y-1">
              {module.prismaModels.map((model) => (
                <li key={model} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                  {model}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Configuration module</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
