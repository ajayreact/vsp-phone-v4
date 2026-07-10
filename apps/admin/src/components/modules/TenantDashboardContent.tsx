'use client';

import { motion } from 'framer-motion';
import {
  PhoneCall,
  PhoneIncoming,
  RefreshCw,
  Smartphone,
  Users,
} from 'lucide-react';
import { useTenantDashboard } from '../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function TenantDashboardContent() {
  const query = useTenantDashboard();

  return (
    <ModuleAccessGate moduleId="dashboard">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            />
            <QueryState
              isLoading={query.isLoading}
              isError={query.isError}
              error={query.error}
              onRetry={() => void query.refetch()}
              skeleton={<KpiSkeleton />}
            >
              {query.data ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Active Calls" value={query.data.activeCalls} icon={PhoneIncoming} />
                    <MetricCard label="Registered Devices" value={query.data.registeredDevices} icon={Smartphone} />
                    <MetricCard label="Extensions Online" value={query.data.registeredExtensions ?? 0} icon={Users} />
                    <MetricCard label="Active Queues" value={query.data.activeQueues} icon={Users} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Assigned DIDs" value={query.data.assignedDids ?? 0} icon={PhoneCall} />
                    <MetricCard label="Queue Waiting" value={query.data.queueWaiting ?? 0} icon={Users} />
                    <MetricCard label="Conferences" value={query.data.activeConferences} icon={PhoneIncoming} />
                    <MetricCard label="Failed Calls Today" value={query.data.failedCallsToday ?? 0} icon={PhoneIncoming} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Snapshot {new Date(query.data.ts).toLocaleString()} · Tenant: {query.data.tenantId}
                  </p>
                </>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
