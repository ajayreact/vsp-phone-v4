'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { usePortal } from '../../lib/portal/PortalProvider';
import { usePlatformCarriers } from '../../lib/hooks/queries/use-platform';
import { useNocCarriers } from '../../lib/hooks/queries/use-telecom-noc';
import type { PlatformCarrierRecord } from '../../types/portal';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { CarriersOpsDashboard } from './noc/CarriersOpsDashboard';

type CarrierRow = PlatformCarrierRecord & { id: string };

function healthBadge(status: string): 'healthy' | 'warning' | 'error' {
  if (status === 'up' || status === 'configured') return 'healthy';
  if (status === 'degraded' || status === 'missing' || status === 'unknown') return 'warning';
  return 'error';
}

const columns: Column<CarrierRow>[] = [
  { key: 'name', header: 'Carrier', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
  {
    key: 'api',
    header: 'API',
    cell: (r) => <StatusBadge status={healthBadge(r.apiStatus ?? r.healthStatus)} />,
  },
  {
    key: 'webhook',
    header: 'Webhook',
    cell: (r) => <StatusBadge status={healthBadge(r.webhookStatus ?? 'unknown')} />,
  },
  {
    key: 'numbers',
    header: 'Numbers',
    cell: (r) => <span className="tabular-nums">{r.numbersCount ?? 0}</span>,
  },
  {
    key: 'trunks',
    header: 'Trunks',
    cell: (r) => <span className="tabular-nums">{r.trunksCount ?? 0}</span>,
  },
  {
    key: 'lastSync',
    header: 'Last Sync',
    cell: (r) =>
      r.lastSyncAt ? (
        <span className="text-xs text-muted-foreground">{new Date(r.lastSyncAt).toLocaleString()}</span>
      ) : (
        '—'
      ),
  },
  {
    key: 'health',
    header: 'Health',
    cell: (r) => <StatusBadge status={healthBadge(r.healthStatus)} />,
  },
];

export function CarriersContent() {
  const portal = usePortal();
  const platformQuery = usePlatformCarriers({ enabled: portal === 'platform' });
  const opsQuery = useNocCarriers({ enabled: portal === 'ops' });

  if (portal === 'ops') {
    return (
      <ModuleAccessGate moduleId="carriers">
        {({ module }) => (
          <PageContainer>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <PageHeader
                title={module.label}
                description={module.description}
                actions={
                  <Button variant="outline" size="sm" onClick={() => void opsQuery.refetch()} disabled={opsQuery.isFetching}>
                    <RefreshCw className={`h-4 w-4 ${opsQuery.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                }
              />
              <QueryState
                isLoading={opsQuery.isLoading}
                isError={opsQuery.isError}
                error={opsQuery.error}
                onRetry={() => void opsQuery.refetch()}
                skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
              >
                {opsQuery.data ? (
                  <CarriersOpsDashboard data={opsQuery.data as Record<string, unknown>} />
                ) : null}
              </QueryState>
            </motion.div>
          </PageContainer>
        )}
      </ModuleAccessGate>
    );
  }

  const rows = withRowIds(platformQuery.data ?? []) as CarrierRow[];

  return (
    <ModuleAccessGate moduleId="carriers">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...platformQuery, data: rows }}
          columns={columns}
          emptyTitle="No carrier integrations"
          emptyDescription="Platform carrier integrations (e.g. Telnyx) appear here once configured."
        />
      )}
    </ModuleAccessGate>
  );
}
