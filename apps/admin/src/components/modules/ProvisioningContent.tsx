'use client';

import { useTenantDevices } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type ProvisioningRow = Record<string, unknown> & { id: string };

const columns: Column<ProvisioningRow>[] = [
  { key: 'name', header: 'Device', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '—') },
  { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.macAddress ?? '—')}</span> },
  { key: 'firmware', header: 'Firmware', cell: (r) => String(r.firmwareVersion ?? r.firmware ?? '—') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? '').toLowerCase() === 'registered' ? 'active' : 'pending'} /> },
];

export function ProvisioningContent() {
  const query = useTenantDevices();
  const rows = withRowIds(query.data ?? []) as ProvisioningRow[];

  return (
    <ModuleAccessGate moduleId="provisioning">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No provisioned devices"
          emptyDescription="Enrolled desk phones appear here once they register via zero-touch provisioning."
        />
      )}
    </ModuleAccessGate>
  );
}
