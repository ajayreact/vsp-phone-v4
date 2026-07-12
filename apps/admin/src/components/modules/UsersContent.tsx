'use client';

import { useState } from 'react';
import { usePortal } from '../../lib/portal/PortalProvider';
import {
  useCreatePlatformUser,
  usePlatformTenants,
  usePlatformUsers,
} from '../../lib/hooks/queries/use-platform';
import { useTenantUsers } from '../../lib/hooks/queries/use-tenant';
import type { UserRecord } from '../../types/portal';
import { Badge, StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';
import { formatExtensionLabel } from '../../lib/extensions/format-extension-label';

type UserRow = UserRecord & { id: string };

const columns: Column<UserRow>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{r.displayName || r.name}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'role', header: 'Role', cell: (r) => <Badge variant="outline">{r.role}</Badge> },
  { key: 'extension', header: 'Extension', cell: (r) => (r.extension ? formatExtensionLabel(r.extension, r.displayName || r.name) : '—') },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName ?? '—' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'active' ? 'active' : r.status === 'inactive' ? 'offline' : 'pending'} /> },
];

const emptyUser = {
  tenantId: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  roleName: 'Tenant Admin',
};

export function UsersContent() {
  const portal = usePortal();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyUser);
  const [error, setError] = useState<string | null>(null);
  const platformQuery = usePlatformUsers({ search });
  const tenantQuery = useTenantUsers(search);
  const tenantsQuery = usePlatformTenants();
  const createUser = useCreatePlatformUser();
  const query = portal === 'tenant' ? tenantQuery : platformQuery;
  const rows = withRowIds(query.data ?? []) as UserRow[];

  const submit = async () => {
    setError(null);
    try {
      await createUser.mutateAsync(form);
      setOpen(false);
      setForm(emptyUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    }
  };

  return (
    <ModuleAccessGate moduleId="users">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            emptyTitle="No users found"
            emptyDescription="User accounts will appear here once provisioned."
            primaryAction={
              portal === 'platform' ? (
                <CreateButton label="Add User" onClick={() => setOpen(true)} />
              ) : undefined
            }
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />

          {portal === 'platform' ? (
            <SlideOver
              open={open}
              onClose={() => {
                setOpen(false);
                setError(null);
              }}
              title="Add User"
              description="Create a user account within a tenant organization."
              footer={
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void submit()}
                    disabled={createUser.isPending || !form.tenantId || !form.email || form.password.length < 8}
                  >
                    {createUser.isPending ? 'Creating…' : 'Create User'}
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">Tenant *</span>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={form.tenantId}
                    onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  >
                    <option value="">Select tenant…</option>
                    {(tenantsQuery.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName || t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
                  <InputField label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
                  <InputField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
                  <InputField label="Password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" />
                  <InputField label="Role" value={form.roleName} onChange={(v) => setForm({ ...form, roleName: v })} />
                </div>
              </div>
            </SlideOver>
          ) : null}
        </>
      )}
    </ModuleAccessGate>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
