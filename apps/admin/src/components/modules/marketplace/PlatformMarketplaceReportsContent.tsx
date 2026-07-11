'use client';

import { motion } from 'framer-motion';
import { BarChart3, RefreshCw } from 'lucide-react';
import { usePlatformMarketplaceReports } from '../../../lib/hooks/queries/use-marketplace';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Card, CardBody } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';

export function PlatformMarketplaceReportsContent() {
  const query = usePlatformMarketplaceReports();

  return (
    <ModuleAccessGate moduleId="marketplace-reports">
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
              skeleton={
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-2xl" />
                  ))}
                </div>
              }
            >
              {query.data ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {[
                    { label: 'Pending Requests', value: query.data.requests.pending },
                    { label: 'Assigned', value: query.data.requests.assigned },
                    { label: 'Rejected', value: query.data.requests.rejected },
                    { label: 'Reserved Inventory', value: query.data.reservedInventory },
                    { label: 'Avg Approval (h)', value: query.data.avgApprovalHours },
                    { label: 'Purchased', value: query.data.requests.purchased ?? 0 },
                    { label: 'Cancelled', value: query.data.requests.cancelled ?? 0 },
                    { label: 'Expired', value: query.data.requests.expired ?? 0 },
                  ].map((c) => (
                    <Card key={c.label} className="glass-card">
                      <CardBody className="py-3">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <p className="flex items-center gap-2 text-lg font-semibold tabular-nums">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          {c.value}
                        </p>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
