'use client';

import { useState } from 'react';
import {
  useCreatePlatformRole,
  usePlatformRoles,
  usePlatformTenants,
} from '../../lib/hooks/queries/use-platform';
import type { PlatformRoleRecord } from '../../types/portal';
import { Badge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
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
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const query = usePlatformRoles();
  const tenantsQuery = usePlatformTenants();
  const createRole = useCreatePlatformRole();
  const rows = withRowIds(query.data ?? []) as RoleRow[];

  const submit = async () => {
    await createRole.mutateAsync({ tenantId, name, description: description || undefined });
    setOpen(false);
    setName('');
    setDescription('');
    setTenantId('');
  };

  return (
    <ModuleAccessGate moduleId="roles">
      {({ module }) => (
        <>
          <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium">Roles represent who the user is.</p>
            <p className="mt-1 text-muted-foreground">
              Platform Super Admin · Platform Admin · Tenant Admin · Manager · Supervisor · Receptionist ·
              Agent · Guest
            </p>
          </div>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No roles configured"
            emptyDescription="Roles will appear here once created for tenant organizations."
            primaryAction={<CreateButton label="Add Role" onClick={() => setOpen(true)} />}
          />

          <SlideOver
            open={open}
            onClose={() => setOpen(false)}
            title="Add Role"
            description="Create a custom role for a tenant organization."
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={!tenantId || !name.trim() || createRole.isPending}>
                  {createRole.isPending ? 'Creating…' : 'Create Role'}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Tenant</span>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                >
                  <option value="">Select tenant…</option>
                  {(tenantsQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName || t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Role name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Description</span>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}
