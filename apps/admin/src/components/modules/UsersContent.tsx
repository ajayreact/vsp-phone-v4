'use client';

import { useState } from 'react';
import { detectPortal } from '../../lib/portal/detect-portal';
import { usePlatformUsers } from '../../lib/hooks/queries/use-platform';
import { useTenantUsers } from '../../lib/hooks/queries/use-tenant';
import type { UserRecord } from '../../types/portal';
import { Badge, StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type UserRow = UserRecord & { id: string };

const columns: Column<UserRow>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{r.displayName || r.name}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'role', header: 'Role', cell: (r) => <Badge variant="outline">{r.role}</Badge> },
  { key: 'extension', header: 'Extension', cell: (r) => r.extension ?? '—' },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName ?? '—' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'active' ? 'active' : r.status === 'inactive' ? 'offline' : 'pending'} /> },
];

export function UsersContent() {
  const portal = detectPortal();
  const [search, setSearch] = useState('');
  const platformQuery = usePlatformUsers(search);
  const tenantQuery = useTenantUsers(search);
  const query = portal === 'tenant' ? tenantQuery : platformQuery;
  const rows = withRowIds(query.data ?? []) as UserRow[];

  return (
    <ModuleAccessGate moduleId="users">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          search={search}
          onSearchChange={setSearch}
          emptyTitle="No users found"
          emptyDescription="User accounts will appear here once provisioned."
          primaryAction={<CreateButton label="Add User" />}
          filterRows={(data, q) => defaultSearchFilter(data, q)}
        />
      )}
    </ModuleAccessGate>
  );
}
