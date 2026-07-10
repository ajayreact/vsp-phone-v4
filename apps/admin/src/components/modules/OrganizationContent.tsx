'use client';

import { motion } from 'framer-motion';
import { Building2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useTenantDashboard } from '../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export function OrganizationContent() {
  const { session } = useAuth();
  const dashboard = useTenantDashboard();

  return (
    <ModuleAccessGate moduleId="organization">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <Button variant="outline" size="sm" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader title="Organization Profile" />
                <CardBody className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{session?.tenant?.name ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs">{session?.tenant?.slug ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tenant ID</span><span className="font-mono text-xs">{session?.tenantId ?? '—'}</span></div>
                </CardBody>
              </Card>
              <Card className="glass-card">
                <CardHeader title="Operations Snapshot" />
                <CardBody>
                  <QueryState
                    isLoading={dashboard.isLoading}
                    isError={dashboard.isError}
                    error={dashboard.error}
                    onRetry={() => void dashboard.refetch()}
                    skeleton={<Skeleton className="h-32 w-full rounded-xl" />}
                  >
                    {dashboard.data ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-muted-foreground">Active Calls</p><p className="text-lg font-semibold">{dashboard.data.activeCalls}</p></div>
                        <div><p className="text-muted-foreground">Devices</p><p className="text-lg font-semibold">{dashboard.data.registeredDevices}</p></div>
                        <div><p className="text-muted-foreground">Extensions</p><p className="text-lg font-semibold">{dashboard.data.registeredExtensions ?? 0}</p></div>
                        <div><p className="text-muted-foreground">Queues</p><p className="text-lg font-semibold">{dashboard.data.activeQueues}</p></div>
                      </div>
                    ) : null}
                  </QueryState>
                </CardBody>
              </Card>
            </div>
            {!session?.tenant ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Sign in with a tenant context to load organization details.
              </p>
            ) : null}
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
