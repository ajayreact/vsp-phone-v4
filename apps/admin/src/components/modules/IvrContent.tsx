'use client';

import { useTenantIvrs } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { CreateButton, ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type IvrRow = Record<string, unknown> & { id: string };

const columns: Column<IvrRow>[] = [
  { key: 'name', header: 'IVR', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
  { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function IvrContent() {
  const query = useTenantIvrs();
  const rows = withRowIds(query.data ?? []) as IvrRow[];

  return (
    <ModuleAccessGate moduleId="ivr">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No IVR menus"
          emptyDescription="Create an IVR to build interactive call flows."
          primaryAction={<CreateButton label="Create IVR" />}
        />
      )}
    </ModuleAccessGate>
  );
}
