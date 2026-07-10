'use client';

import { useState } from 'react';
import { usePlatformTenants } from '../../lib/hooks/queries/use-platform';
import type { PlatformTenantRecord } from '../../types/portal';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type TenantRow = PlatformTenantRecord & { id: string };

const columns: Column<TenantRow>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{r.displayName || r.name}</span> },
  { key: 'slug', header: 'Slug', cell: (r) => <span className="font-mono text-xs">{r.slug}</span> },
  { key: 'publicId', header: 'Public ID', cell: (r) => <span className="font-mono text-xs">{r.publicId}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'ACTIVE' ? 'active' : r.status === 'SUSPENDED' ? 'warning' : 'pending'} /> },
  { key: 'created', header: 'Created', cell: (r) => <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span> },
];

export function TenantsContent() {
  const [search, setSearch] = useState('');
  const query = usePlatformTenants(search ? { search } : undefined);
  const rows = withRowIds(query.data ?? []) as TenantRow[];

  return (
    <ModuleAccessGate moduleId="tenants">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search tenants by name or slug…"
          emptyTitle="No tenants yet"
          emptyDescription="Create your first tenant organization to begin onboarding."
          primaryAction={<CreateButton label="Create Tenant" />}
          filterRows={(data, q) => defaultSearchFilter(data, q)}
        />
      )}
    </ModuleAccessGate>
  );
}
