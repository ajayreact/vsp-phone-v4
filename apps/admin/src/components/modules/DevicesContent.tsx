'use client';

import { useState } from 'react';
import { useTenantDevices } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type DeviceRow = Record<string, unknown> & { id: string };

const columns: Column<DeviceRow>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '—') },
  { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.macAddress ?? r.mac ?? '—')}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'offline').toLowerCase() === 'online' ? 'online' : 'offline'} /> },
  { key: 'line', header: 'Line', cell: (r) => {
    const line = r.line as { name?: string } | undefined;
    return line?.name ?? '—';
  }},
];

export function DevicesContent() {
  const [search, setSearch] = useState('');
  const query = useTenantDevices(search);
  const rows = withRowIds(query.data ?? []) as DeviceRow[];

  return (
    <ModuleAccessGate moduleId="devices">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          search={search}
          onSearchChange={setSearch}
          emptyTitle="No devices registered"
          emptyDescription="Provision desk phones to see them listed here."
          primaryAction={<CreateButton label="Provision Device" />}
          filterRows={(data, q) => defaultSearchFilter(data, q)}
        />
      )}
    </ModuleAccessGate>
  );
}
