'use client';

import { useMemo } from 'react';
import { usePlatformPermissions } from '../../lib/hooks/queries/use-platform';
import type { PlatformPermissionRecord } from '../../types/portal';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type PermissionRow = PlatformPermissionRecord & { id: string; group?: string };

function permissionGroup(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('user')) return 'Users';
  if (k.includes('extension')) return 'Extensions';
  if (k.includes('device')) return 'Devices';
  if (k.includes('number') || k.includes('did') || k.includes('phone')) return 'Numbers';
  if (k.includes('report') || k.includes('cdr') || k.includes('analytics')) return 'Reports';
  if (k.includes('provision')) return 'Provisioning';
  if (k.includes('api_key') || k.includes('api-key')) return 'API Keys';
  if (k.includes('setting') || k.includes('organization') || k.includes('company')) return 'Settings';
  return 'Other';
}

const columns: Column<PermissionRow>[] = [
  { key: 'group', header: 'Group', cell: (r) => r.group ?? '—' },
  { key: 'key', header: 'Permission', sortable: true, cell: (r) => <span className="font-mono text-xs font-medium">{r.key}</span> },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
  { key: 'description', header: 'Description', cell: (r) => r.description ?? '—' },
];

export function PermissionsContent() {
  const query = usePlatformPermissions();
  const rows = useMemo(
    () =>
      withRowIds(
        (query.data ?? []).map((r) => ({
          ...r,
          group: permissionGroup(r.key),
        })),
      ) as PermissionRow[],
    [query.data],
  );

  return (
    <ModuleAccessGate moduleId="permissions">
      {({ module }) => (
        <>
          <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium">Permissions represent what users can do.</p>
            <p className="mt-1 text-muted-foreground">
              Grouped as Users · Extensions · Devices · Numbers · Reports · Provisioning · API Keys · Settings
            </p>
          </div>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No permissions found"
            emptyDescription="Permission catalog entries will appear here from tenant RBAC configuration."
          />
        </>
      )}
    </ModuleAccessGate>
  );
}
