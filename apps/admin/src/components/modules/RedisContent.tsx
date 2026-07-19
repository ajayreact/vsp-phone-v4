'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useRedisStats } from '../../lib/hooks/queries/use-ops';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { RedisOpsDashboard } from './noc/RedisOpsDashboard';

export function RedisContent() {
  const query = useRedisStats();

  return (
    <ModuleAccessGate moduleId="redis">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
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
              skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
            >
              {query.data ? <RedisOpsDashboard data={query.data as Record<string, unknown>} /> : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
