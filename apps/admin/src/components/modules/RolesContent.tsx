'use client';

import { usePlatformRoles } from '../../lib/hooks/queries/use-platform';
import type { PlatformRoleRecord } from '../../types/portal';
import { Badge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { CreateButton, ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type RoleRow = PlatformRoleRecord & { id: string };

const columns: Column<RoleRow>[] = [
  { key: 'name', header: 'Role', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
  { key: 'permissions', header: 'Permissions', cell: (r) => String(r.permissionCount) },
  { key: 'type', header: 'Type', cell: (r) => <Badge variant="outline">{r.systemRole ? 'System' : 'Custom'}</Badge> },
  { key: 'description', header: 'Description', cell: (r) => r.description ?? '—' },
];

export function RolesContent() {
  const query = usePlatformRoles();
  const rows = withRowIds(query.data ?? []) as RoleRow[];

  return (
    <ModuleAccessGate moduleId="roles">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No roles configured"
          emptyDescription="Roles will appear here once created for tenant organizations."
          primaryAction={<CreateButton label="Add Role" />}
        />
      )}
    </ModuleAccessGate>
  );
}
