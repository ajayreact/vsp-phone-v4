'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { usePlatformDashboard } from '../../lib/hooks/queries/use-platform';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import {
  Building2,
  Cable,
  CreditCard,
  PhoneCall,
  PhoneIncoming,
  Smartphone,
  Users,
} from 'lucide-react';
import { StatusBadge } from '../ui/Badge';

function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function PlatformDashboardContent() {
  const query = usePlatformDashboard();

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
                    <MetricCard label="Total Tenants" value={query.data.totalTenants} icon={Building2} />
                    <MetricCard label="Total Extensions" value={query.data.totalExtensions} icon={Users} />
                    <MetricCard label="Registered Devices" value={query.data.registeredDevices} icon={Smartphone} />
                    <MetricCard label="Concurrent Calls" value={query.data.concurrentCalls} icon={PhoneIncoming} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Telnyx Inventory" value={query.data.telnyxInventory} icon={PhoneCall} />
                    <MetricCard label="Assigned DIDs" value={query.data.assignedDids} icon={PhoneCall} />
                    <MetricCard label="Unassigned DIDs" value={query.data.unassignedDids} icon={PhoneCall} />
                    <MetricCard label="Failed Calls Today" value={query.data.failedCallsToday} icon={PhoneIncoming} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="MRR" value={formatCents(query.data.mrrCents)} icon={CreditCard} />
                    <MetricCard label="Carrier Cost" value={formatCents(query.data.carrierCostCents)} icon={CreditCard} />
                    <MetricCard label="Gross Margin" value={formatCents(query.data.grossMarginCents)} icon={CreditCard} />
                    <MetricCard label="Recordings" value={query.data.recordingCount} icon={PhoneCall} />
                  </div>
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3">
                    <Cable className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Carrier Status</span>
                    <StatusBadge
                      status={
                        query.data.carrierStatus.status === 'up'
                          ? 'healthy'
                          : query.data.carrierStatus.status === 'degraded'
                            ? 'warning'
                            : 'error'
                      }
                    />
                    {query.data.carrierStatus.latencyMs != null ? (
                      <span className="text-xs text-muted-foreground">{query.data.carrierStatus.latencyMs}ms</span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Snapshot {new Date(query.data.ts).toLocaleString()}
                    </span>
                  </div>
                </>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
