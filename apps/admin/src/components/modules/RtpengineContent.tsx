'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useNocRtpengine } from '../../lib/hooks/queries/use-telecom-noc';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { RtpengineOpsDashboard } from './noc/RtpengineOpsDashboard';

export function RtpengineContent() {
  const dashboard = useNocRtpengine();

  return (
    <ModuleAccessGate moduleId="rtpengine">
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
                  onClick={() => void dashboard.refetch()}
                  disabled={dashboard.isFetching}
                >
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
              skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
            >
              {dashboard.data ? (
                <RtpengineOpsDashboard data={dashboard.data as Record<string, unknown>} />
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
