'use client';

import { useTenantRouting } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { CreateButton, ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type RoutingRow = Record<string, unknown> & { id: string };

const columns: Column<RoutingRow>[] = [
  { key: 'name', header: 'Policy', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
  { key: 'direction', header: 'Direction', cell: (r) => String(r.direction ?? '—') },
  { key: 'priority', header: 'Priority', cell: (r) => String(r.priority ?? '—') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function CallRoutingContent() {
  const query = useTenantRouting();
  const rows = withRowIds(query.data ?? []) as RoutingRow[];

  return (
    <ModuleAccessGate moduleId="call-routing">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No routing policies"
          emptyDescription="Define inbound and outbound routing rules for your tenant."
          primaryAction={<CreateButton label="Add Policy" />}
        />
      )}
    </ModuleAccessGate>
  );
}
