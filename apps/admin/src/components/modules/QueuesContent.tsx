'use client';

import { useTenantQueues } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { CreateButton, ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type QueueRow = Record<string, unknown> & { id: string };

const columns: Column<QueueRow>[] = [
  { key: 'name', header: 'Queue', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
  { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
  { key: 'members', header: 'Members', cell: (r) => String((r.members as unknown[])?.length ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function QueuesContent() {
  const query = useTenantQueues();
  const rows = withRowIds(query.data ?? []) as QueueRow[];

  return (
    <ModuleAccessGate moduleId="queues">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No call queues"
          emptyDescription="Create a queue to route inbound calls to agents."
          primaryAction={<CreateButton label="Create Queue" />}
        />
      )}
    </ModuleAccessGate>
  );
}
