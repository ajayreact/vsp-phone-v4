'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { detectPortal } from '../../lib/portal/detect-portal';
import { usePlatformCarriers } from '../../lib/hooks/queries/use-platform';
import { useOpsCarriersHealth } from '../../lib/hooks/queries/use-ops';
import type { PlatformCarrierRecord } from '../../types/portal';
import { Badge, StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

type CarrierRow = PlatformCarrierRecord & { id: string };

const columns: Column<CarrierRow>[] = [
  { key: 'name', header: 'Carrier', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
  { key: 'type', header: 'Type', cell: (r) => <Badge variant="outline">{r.carrierType}</Badge> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'ACTIVE' ? 'active' : 'pending'} /> },
  {
    key: 'health',
    header: 'Health',
    cell: (r) => (
      <StatusBadge
        status={r.healthStatus === 'up' ? 'healthy' : r.healthStatus === 'degraded' ? 'warning' : 'error'}
      />
    ),
  },
];

export function CarriersContent() {
  const portal = detectPortal();
  const platformQuery = usePlatformCarriers();
  const opsQuery = useOpsCarriersHealth();

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
                  <Card className="glass-card">
                    <CardBody>
                      <pre className="overflow-x-auto rounded-xl bg-muted/40 p-4 text-xs leading-relaxed">
                        {JSON.stringify(opsQuery.data, null, 2)}
                      </pre>
                    </CardBody>
                  </Card>
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
          emptyDescription="Carrier adapters will appear here once configured for tenants."
        />
      )}
    </ModuleAccessGate>
  );
}
