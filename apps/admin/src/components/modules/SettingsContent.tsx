'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { detectPortal } from '../../lib/portal/detect-portal';
import { usePlatformDashboard } from '../../lib/hooks/queries/use-platform';
import { useAuth } from '../../lib/auth/AuthProvider';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export function SettingsContent() {
  const portal = detectPortal();
  const { session } = useAuth();
  const platformDashboard = usePlatformDashboard();

  return (
    <ModuleAccessGate moduleId="settings">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                portal === 'platform' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void platformDashboard.refetch()}
                    disabled={platformDashboard.isFetching}
                  >
                    <RefreshCw className={`h-4 w-4 ${platformDashboard.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                ) : null
              }
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader title="Session" description="Current authenticated user context." />
                <CardBody className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{session?.email ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{session?.userId ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tenant</span><span>{session?.tenant?.name ?? session?.tenantId ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Roles</span><span>{session?.roles.map((r) => r.name).join(', ') || '—'}</span></div>
                </CardBody>
              </Card>
              {portal === 'platform' ? (
                <Card className="glass-card">
                  <CardHeader title="Platform Overview" description="Live metrics from platform dashboard." />
                  <CardBody>
                    <QueryState
                      isLoading={platformDashboard.isLoading}
                      isError={platformDashboard.isError}
                      error={platformDashboard.error}
                      onRetry={() => void platformDashboard.refetch()}
                      skeleton={<Skeleton className="h-32 w-full rounded-xl" />}
                    >
                      {platformDashboard.data ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><p className="text-muted-foreground">Tenants</p><p className="text-lg font-semibold">{platformDashboard.data.totalTenants}</p></div>
                          <div><p className="text-muted-foreground">Extensions</p><p className="text-lg font-semibold">{platformDashboard.data.totalExtensions}</p></div>
                          <div><p className="text-muted-foreground">Active Alerts</p><p className="text-lg font-semibold">{platformDashboard.data.activeAlerts}</p></div>
                          <div><p className="text-muted-foreground">Telnyx Numbers</p><p className="text-lg font-semibold">{platformDashboard.data.telnyxInventory}</p></div>
                        </div>
                      ) : null}
                    </QueryState>
                  </CardBody>
                </Card>
              ) : (
                <Card className="glass-card">
                  <CardHeader title="Portal" description="Tenant portal configuration." />
                  <CardBody className="text-sm text-muted-foreground">
                    <p>Portal type: <span className="font-medium text-foreground">{portal}</span></p>
                    <p className="mt-2">Tenant settings are managed through your organization profile and RBAC roles.</p>
                  </CardBody>
                </Card>
              )}
            </div>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
