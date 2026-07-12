'use client';

import { motion } from 'framer-motion';
import { Activity, RefreshCw } from 'lucide-react';
import { useTenantCdr } from '../../lib/hooks/queries/use-tenant';
import { useTenantDashboard } from '../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { PhoneIncoming, Users } from 'lucide-react';

export function ReportsContent({ moduleId = 'analytics' }: { moduleId?: string }) {
  const dashboard = useTenantDashboard();
  const cdr = useTenantCdr({ limit: 500 });

  const totalCalls = cdr.data?.length ?? 0;
  const completedCalls = cdr.data?.filter((r) => String(r.state ?? '').includes('ENDED')).length ?? 0;

  return (
    <ModuleAccessGate moduleId={moduleId}>
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
                    void dashboard.refetch();
                    void cdr.refetch();
                  }}
                  disabled={dashboard.isFetching || cdr.isFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${dashboard.isFetching || cdr.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            />
            <QueryState
              isLoading={dashboard.isLoading || cdr.isLoading}
              isError={dashboard.isError || cdr.isError}
              error={dashboard.error ?? cdr.error}
              onRetry={() => {
                void dashboard.refetch();
                void cdr.refetch();
              }}
              skeleton={
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-2xl" />
                  ))}
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="CDR Records" value={totalCalls} icon={Activity} />
                <MetricCard label="Completed Calls" value={completedCalls} icon={PhoneIncoming} />
                <MetricCard label="Active Calls" value={dashboard.data?.activeCalls ?? 0} icon={PhoneIncoming} />
                <MetricCard label="Registered Devices" value={dashboard.data?.registeredDevices ?? 0} icon={Users} />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Usage reports are derived from live CDR and tenant dashboard metrics.
              </p>
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
