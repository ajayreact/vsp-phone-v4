'use client';

import { usePlatformPermissions } from '../../lib/hooks/queries/use-platform';
import type { PlatformPermissionRecord } from '../../types/portal';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type PermissionRow = PlatformPermissionRecord & { id: string };

const columns: Column<PermissionRow>[] = [
  { key: 'key', header: 'Permission', sortable: true, cell: (r) => <span className="font-mono text-xs font-medium">{r.key}</span> },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
  { key: 'description', header: 'Description', cell: (r) => r.description ?? '—' },
];

export function PermissionsContent() {
  const query = usePlatformPermissions();
  const rows = withRowIds(query.data ?? []) as PermissionRow[];

  return (
    <ModuleAccessGate moduleId="permissions">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No permissions found"
          emptyDescription="Permission catalog entries will appear here from tenant RBAC configuration."
        />
      )}
    </ModuleAccessGate>
  );
}
