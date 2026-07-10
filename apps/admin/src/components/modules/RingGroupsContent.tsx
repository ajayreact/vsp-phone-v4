'use client';

import { useTenantRingGroups } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { CreateButton, ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type RingGroupRow = Record<string, unknown> & { id: string };

const columns: Column<RingGroupRow>[] = [
  { key: 'name', header: 'Ring Group', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
  { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
  { key: 'members', header: 'Members', cell: (r) => String((r.members as unknown[])?.length ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function RingGroupsContent() {
  const query = useTenantRingGroups();
  const rows = withRowIds(query.data ?? []) as RingGroupRow[];

  return (
    <ModuleAccessGate moduleId="ring-groups">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No ring groups"
          emptyDescription="Create a ring group to ring multiple extensions simultaneously."
          primaryAction={<CreateButton label="Create Ring Group" />}
        />
      )}
    </ModuleAccessGate>
  );
}
