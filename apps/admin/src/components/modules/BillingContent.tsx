'use client';

import { motion } from 'framer-motion';
import { CreditCard, RefreshCw } from 'lucide-react';
import { usePlatformBilling } from '../../lib/hooks/queries/use-platform';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function BillingContent() {
  const query = usePlatformBilling();

  return (
    <ModuleAccessGate moduleId="billing">
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
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-2xl" />
                  ))}
                </div>
              }
            >
              {query.data ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <MetricCard label="MRR" value={formatCents(query.data.mrrCents, query.data.currency)} icon={CreditCard} />
                  <MetricCard label="Carrier Cost" value={formatCents(query.data.carrierCostCents, query.data.currency)} icon={CreditCard} />
                  <MetricCard label="Gross Margin" value={formatCents(query.data.grossMarginCents, query.data.currency)} icon={CreditCard} />
                  <MetricCard label="Active Subscriptions" value={query.data.activeSubscriptions} icon={CreditCard} />
                  <MetricCard label="Total Invoices" value={query.data.totalInvoices} icon={CreditCard} />
                  <MetricCard label="Unpaid Invoices" value={query.data.unpaidInvoices} icon={CreditCard} />
                </div>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
