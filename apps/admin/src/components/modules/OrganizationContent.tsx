'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { usePortal } from '../../lib/portal/PortalProvider';
import {
  usePlatformOrganization,
  usePlatformTenants,
  useUpdatePlatformOrganization,
} from '../../lib/hooks/queries/use-platform';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useTenantDashboard } from '../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from './shared/ModuleShell';
import { EmptyState } from '../data/EmptyState';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/Badge';

export function OrganizationContent() {
  const portal = usePortal();
  const { session } = useAuth();
  const tenantsQuery = usePlatformTenants();
  const [tenantId, setTenantId] = useState('');
  const orgQuery = usePlatformOrganization(tenantId);
  const updateOrg = useUpdatePlatformOrganization();
  const tenantDashboard = useTenantDashboard();
  const [form, setForm] = useState({ displayName: '', timezone: '', defaultLanguage: '' });

  useEffect(() => {
    if (portal === 'platform' && tenantsQuery.data?.length && !tenantId) {
      setTenantId(tenantsQuery.data[0].id);
    }
  }, [portal, tenantsQuery.data, tenantId]);

  useEffect(() => {
    if (orgQuery.data) {
      setForm({
        displayName: orgQuery.data.displayName,
        timezone: orgQuery.data.timezone ?? '',
        defaultLanguage: orgQuery.data.defaultLanguage ?? '',
      });
    }
  }, [orgQuery.data]);

  const save = async () => {
    if (!tenantId) return;
    await updateOrg.mutateAsync({
      tenantId,
      payload: {
        displayName: form.displayName,
        timezone: form.timezone,
        defaultLanguage: form.defaultLanguage,
      },
    });
  };

  return (
    <ModuleAccessGate moduleId="organization">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (portal === 'platform') void orgQuery.refetch();
                    else void tenantDashboard.refetch();
                  }}
                  disabled={portal === 'platform' ? orgQuery.isFetching : tenantDashboard.isFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${(portal === 'platform' ? orgQuery.isFetching : tenantDashboard.isFetching) ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            />

            {portal === 'platform' ? (
              <QueryState
                isLoading={tenantsQuery.isLoading}
                isError={tenantsQuery.isError}
                error={tenantsQuery.error}
                onRetry={() => void tenantsQuery.refetch()}
                isEmpty={!tenantsQuery.data?.length}
                empty={
                  <EmptyState
                    title="No tenants available"
                    description="Provision a tenant from Platform → Tenants before editing organization profiles."
                  />
                }
                skeleton={<div className="mb-6 max-w-md h-10 rounded-xl bg-muted animate-pulse" />}
              >
                <div className="mb-6 max-w-md">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Tenant</span>
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                    >
                      {(tenantsQuery.data ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName || t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </QueryState>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader title="Organization Profile" />
                <CardBody>
                  {portal === 'platform' ? (
                    <QueryState
                      isLoading={orgQuery.isLoading}
                      isError={orgQuery.isError}
                      error={orgQuery.error}
                      onRetry={() => void orgQuery.refetch()}
                      isEmpty={!tenantId}
                      empty={
                        <EmptyState
                          title="Select a tenant"
                          description="Choose a tenant above to view and edit organization settings."
                        />
                      }
                      skeleton={<Skeleton className="h-40 w-full rounded-xl" />}
                    >
                      {orgQuery.data ? (
                        <div className="space-y-4 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs">{orgQuery.data.slug}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={orgQuery.data.status === 'ACTIVE' ? 'active' : 'warning'} /></div>
                          <label className="block space-y-1.5">
                            <span className="font-medium">Display name</span>
                            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                          </label>
                          <label className="block space-y-1.5">
                            <span className="font-medium">Timezone</span>
                            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                          </label>
                          <label className="block space-y-1.5">
                            <span className="font-medium">Default language</span>
                            <Input value={form.defaultLanguage} onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })} />
                          </label>
                          <Button onClick={() => void save()} disabled={updateOrg.isPending}>
                            {updateOrg.isPending ? 'Saving…' : 'Save Organization'}
                          </Button>
                        </div>
                      ) : null}
                    </QueryState>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{session?.tenant?.name ?? '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs">{session?.tenant?.slug ?? '—'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Tenant ID</span><span className="font-mono text-xs">{session?.tenantId ?? '—'}</span></div>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card className="glass-card">
                <CardHeader title={portal === 'platform' ? 'Sites' : 'Operations Snapshot'} />
                <CardBody>
                  {portal === 'platform' ? (
                    orgQuery.data?.sites.length ? (
                      <ul className="space-y-2 text-sm">
                        {orgQuery.data.sites.map((site) => (
                          <li key={site.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                            <span>{site.name}</span>
                            <StatusBadge status={site.status === 'ACTIVE' ? 'active' : 'pending'} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No sites configured for this tenant.</p>
                    )
                  ) : (
                    <QueryState
                      isLoading={tenantDashboard.isLoading}
                      isError={tenantDashboard.isError}
                      error={tenantDashboard.error}
                      onRetry={() => void tenantDashboard.refetch()}
                      skeleton={<Skeleton className="h-32 w-full rounded-xl" />}
                    >
                      {tenantDashboard.data ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><p className="text-muted-foreground">Active Calls</p><p className="text-lg font-semibold">{tenantDashboard.data.activeCalls}</p></div>
                          <div><p className="text-muted-foreground">Devices</p><p className="text-lg font-semibold">{tenantDashboard.data.registeredDevices}</p></div>
                          <div><p className="text-muted-foreground">Extensions</p><p className="text-lg font-semibold">{tenantDashboard.data.registeredExtensions ?? 0}</p></div>
                          <div><p className="text-muted-foreground">Queues</p><p className="text-lg font-semibold">{tenantDashboard.data.activeQueues}</p></div>
                        </div>
                      ) : null}
                    </QueryState>
                  )}
                </CardBody>
              </Card>
            </div>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
