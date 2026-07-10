'use client';

import { useState } from 'react';
import { useTenantDids } from '../../lib/hooks/queries/use-tenant';
import { Badge, StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type DidRow = Record<string, unknown> & { id: string };

const columns: Column<DidRow>[] = [
  { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono font-medium">{String(r.number ?? r.e164 ?? '')}</span> },
  { key: 'carrier', header: 'Carrier', cell: (r) => String(r.carrier ?? r.carrierType ?? '—') },
  { key: 'assignedTo', header: 'Assigned To', cell: (r) => String(r.assignedTo ?? r.lineName ?? '—') },
  { key: 'type', header: 'Type', cell: (r) => <Badge variant="outline">{String(r.type ?? 'voice')}</Badge> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function DidsContent() {
  const [search, setSearch] = useState('');
  const query = useTenantDids(search);
  const rows = withRowIds(query.data ?? []) as DidRow[];

  return (
    <ModuleAccessGate moduleId="dids">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          search={search}
          onSearchChange={setSearch}
          emptyTitle="No phone numbers assigned"
          emptyDescription="Request or assign DIDs to route inbound calls."
          primaryAction={<CreateButton label="Request Number" />}
          filterRows={(data, q) => defaultSearchFilter(data, q)}
        />
      )}
    </ModuleAccessGate>
  );
}
