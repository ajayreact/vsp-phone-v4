'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useSipTrunks } from '../../lib/hooks/queries/use-telecom';
import { ModuleAccessGate } from './shared/ModuleShell';
import type { SipTrunkRecord } from '../../types/telecom';
import { DataTable, type Column } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

const columns: Column<SipTrunkRecord>[] = [
  {
    key: 'name',
    header: 'Trunk Name',
    sortable: true,
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: 'carrier', header: 'Carrier', cell: (r) => r.carrier },
  {
    key: 'registration',
    header: 'Registration',
    cell: (r) => (
      <StatusBadge status={r.registration === 'registered' ? 'online' : 'offline'} />
    ),
  },
  {
    key: 'channels',
    header: 'Concurrent Channels',
    cell: (r) => `${r.channelsInUse}/${r.channelsTotal}`,
  },
  {
    key: 'calls',
    header: 'Calls',
    cell: (r) => String(r.concurrentCalls ?? r.channelsInUse),
  },
  {
    key: 'latency',
    header: 'Latency',
    cell: (r) => (r.latencyMs > 0 ? `${r.latencyMs}ms` : '—'),
  },
  {
    key: 'loss',
    header: 'Packet Loss',
    cell: (r) => `${r.packetLossPct}%`,
  },
  {
    key: 'failover',
    header: 'Failover',
    cell: (r) => (r.failoverEnabled ? 'Enabled' : 'Disabled'),
  },
  {
    key: 'health',
    header: 'Health',
    cell: (r) => (
      <StatusBadge
        status={r.health === 'up' ? 'healthy' : r.health === 'degraded' ? 'warning' : 'error'}
      />
    ),
  },
];

export function TrunksContent() {
  const query = useSipTrunks();
  const trunks = useMemo(() => query.data ?? [], [query.data]);
  const metricsUnavailable =
    !query.isLoading &&
    !query.isError &&
    (trunks.length === 0 || trunks.every((t) => t.metricsAvailable === false));

  return (
    <ModuleAccessGate moduleId="trunks">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
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
              isEmpty={metricsUnavailable}
              empty={
                <EmptyState
                  title="No SIP Trunk metrics available"
                  description="Telnyx SIP trunk metrics will appear here when the platform carrier is configured and reporting health samples."
                />
              }
              skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
            >
              <DataTable columns={columns} data={trunks} />
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
