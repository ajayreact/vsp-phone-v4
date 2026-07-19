'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useKamailioPersistence } from '../../lib/hooks/queries/use-ops';
import { useNocKamailio, useNocSipRegistrations } from '../../lib/hooks/queries/use-telecom-noc';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { KamailioOpsDashboard } from './noc/KamailioOpsDashboard';

export function KamailioContent() {
  const dashboard = useNocKamailio();
  const persistence = useKamailioPersistence();
  const registrations = useNocSipRegistrations();

  return (
    <ModuleAccessGate moduleId="kamailio">
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
                    void persistence.refetch();
                  }}
                  disabled={dashboard.isFetching || persistence.isFetching}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${dashboard.isFetching || persistence.isFetching ? 'animate-spin' : ''}`}
                  />
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
                <KamailioOpsDashboard
                  data={
                    {
                      ...(dashboard.data as Record<string, unknown>),
                      persistence:
                        (dashboard.data as Record<string, unknown>).persistence ?? persistence.data,
                    } as Record<string, unknown>
                  }
                  registrationCount={registrations.data?.length ?? null}
                />
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
