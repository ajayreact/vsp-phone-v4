'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  Building2,
  Hash,
  Headphones,
  Phone,
  PhoneCall,
  RefreshCw,
  Smartphone,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePlatformDashboard } from '../../lib/hooks/queries/use-platform';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

function healthBadge(status: string): 'healthy' | 'warning' | 'error' {
  if (status === 'up') return 'healthy';
  if (status === 'degraded') return 'warning';
  return 'error';
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
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Link href="/tenants" className="block transition-transform hover:scale-[1.01]">
                    <MetricCard label="Tenants" value={query.data.totalTenants ?? 0} icon={Building2} />
                  </Link>
                  <Link href="/users" className="block transition-transform hover:scale-[1.01]">
                    <MetricCard label="Users" value={query.data.totalUsers ?? 0} icon={Users} />
                  </Link>
                  <MetricCard label="Extensions" value={query.data.totalExtensions ?? 0} icon={Hash} />
                  <MetricCard label="Devices" value={query.data.totalDevices ?? 0} icon={Smartphone} />
                  <Link href="/telnyx-numbers" className="block transition-transform hover:scale-[1.01]">
                    <MetricCard label="Numbers" value={query.data.totalNumbers ?? 0} icon={Phone} />
                  </Link>
                  <MetricCard label="Calls" value={query.data.concurrentCalls ?? 0} icon={PhoneCall} />
                  <MetricCard label="Channels" value={query.data.channels ?? query.data.concurrentCalls ?? 0} icon={Headphones} />
                  <Link href="/system-health" className="block transition-transform hover:scale-[1.01]">
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Health</p>
                          <StatusBadge status={healthBadge(query.data.healthStatus ?? 'down')} />
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Activity className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
