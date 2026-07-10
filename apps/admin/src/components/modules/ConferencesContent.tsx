'use client';

import { motion } from 'framer-motion';
import { Radio, RefreshCw } from 'lucide-react';
import { useTenantDashboard } from '../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from './shared/ModuleShell';
import { EmptyState } from '../data/EmptyState';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

export function ConferencesContent() {
  const dashboard = useTenantDashboard();
  const activeConferences = dashboard.data?.activeConferences ?? 0;

  return (
    <ModuleAccessGate moduleId="conferences">
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
            <QueryState
              isLoading={dashboard.isLoading}
              isError={dashboard.isError}
              error={dashboard.error}
              onRetry={() => void dashboard.refetch()}
              skeleton={<Skeleton className="h-28 w-full max-w-sm rounded-2xl" />}
            >
              <MetricCard label="Active Conferences" value={activeConferences} icon={Radio} />
              {activeConferences === 0 ? (
                <div className="mt-6">
                  <EmptyState
                    title="No active conferences"
                    description="Conference bridges will appear here when sessions are in progress."
                    icon={Radio}
                  />
                </div>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
