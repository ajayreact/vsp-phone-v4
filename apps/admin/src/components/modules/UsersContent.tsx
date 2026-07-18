'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, KeyRound, UserCheck, UserX, Trash2, Phone } from 'lucide-react';
import { usePortal } from '../../lib/portal/PortalProvider';
import {
  useCreatePlatformUser,
  usePlatformTenants,
  usePlatformUsers,
} from '../../lib/hooks/queries/use-platform';
import { useTenantExtensions, useTenantUsers } from '../../lib/hooks/queries/use-tenant';
import {
  useAssignTenantUserExtension,
  useCreateTenantUser,
  useDeleteTenantUser,
  useResetTenantUserPassword,
  useSetTenantUserStatus,
  useUnassignTenantUserExtension,
  useUpdateTenantUser,
} from '../../lib/hooks/queries/use-tenant-mutations';
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

type TenantUserForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleName: string;
};

const emptyTenantForm: TenantUserForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  roleName: 'User',
};

const emptyPlatformUser = {
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
  const [tenantFilter, setTenantFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [assignRow, setAssignRow] = useState<UserRow | null>(null);
  const [extensionId, setExtensionId] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPlatformUser);
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const [editForm, setEditForm] = useState({ email: '', firstName: '', lastName: '', roleName: 'User' });
  const [error, setError] = useState<string | null>(null);

  const platformQuery = usePlatformUsers({
    search: search || undefined,
    tenantId: tenantFilter || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  });
  const tenantQuery = useTenantUsers(search);
  const tenantsQuery = usePlatformTenants();
  const extensionsQuery = useTenantExtensions();
  const createPlatformUser = useCreatePlatformUser();
  const createTenantUser = useCreateTenantUser();
  const updateTenantUser = useUpdateTenantUser();
  const deleteTenantUser = useDeleteTenantUser();
  const setStatus = useSetTenantUserStatus();
  const resetPassword = useResetTenantUserPassword();
  const assignExt = useAssignTenantUserExtension();
  const unassignExt = useUnassignTenantUserExtension();

  const query = portal === 'tenant' ? tenantQuery : platformQuery;
  const rows = withRowIds(query.data ?? []) as UserRow[];
  const extensions = (extensionsQuery.data ?? []) as Array<Record<string, unknown>>;

  const columns: Column<UserRow>[] = useMemo(() => {
    const base: Column<UserRow>[] = [
      {
        key: 'extension',
        header: 'Extension',
        sortable: true,
        cell: (r) => {
          if (!r.extension) return '—';
          const label = formatExtensionLabel(r.extension, r.displayName || r.name);
          if (r.extensionId && portal === 'tenant') {
            return (
              <Link
                href={`/extensions?configure=${encodeURIComponent(r.extensionId)}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {label}
              </Link>
            );
          }
          return <span className="font-medium text-primary">{label}</span>;
        },
      },
      {
        key: 'name',
        header: 'User',
        sortable: true,
        cell: (r) => <span className="font-medium">{r.displayName || r.name}</span>,
      },
      {
        key: 'primaryDid',
        header: 'Primary DID',
        cell: (r) =>
          r.primaryDid ? <span className="font-mono text-sm">{r.primaryDid}</span> : '—',
      },
      {
        key: 'primaryDevice',
        header: 'Primary Device',
        cell: (r) => r.primaryDevice ?? '—',
      },
      {
        key: 'registration',
        header: 'Registration Status',
        cell: (r) => {
          const s = (r.registrationStatus ?? '').toLowerCase();
          if (!s) return '—';
          const badge =
            s === 'registered' || s === 'online' || s === 'busy'
              ? 'online'
              : s === 'offline' || s === 'unregistered'
                ? 'offline'
                : 'pending';
          return <StatusBadge status={badge} />;
        },
      },
      { key: 'email', header: 'Email', cell: (r) => r.email },
      { key: 'role', header: 'Role', cell: (r) => <Badge variant="outline">{r.role}</Badge> },
    ];
    if (portal === 'platform') {
      base.push({ key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName ?? '—' });
    }
    base.push({
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusBadge
          status={r.status === 'active' ? 'active' : r.status === 'inactive' ? 'offline' : 'pending'}
        />
      ),
    });
    if (portal === 'tenant') {
      base.push({
        key: 'actions',
        header: '',
        cell: (r) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              title="Edit"
              onClick={() => {
                const parts = (r.displayName || r.name || '').split(/\s+/);
                setEditRow(r);
                setEditForm({
                  email: r.email,
                  firstName: parts[0] ?? '',
                  lastName: parts.slice(1).join(' ') || '',
                  roleName: r.role || 'User',
                });
                setError(null);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Assign extension"
              onClick={() => {
                setAssignRow(r);
                setExtensionId('');
                setError(null);
              }}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title={r.status === 'active' ? 'Disable' : 'Enable'}
              onClick={() =>
                void setStatus.mutateAsync({
                  id: r.id,
                  status: r.status === 'active' ? 'INACTIVE' : 'ACTIVE',
                })
              }
            >
              {r.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Reset password"
              onClick={() =>
                void resetPassword.mutateAsync({ id: r.id }).then((res) => {
                  setTempPassword(res.temporaryPassword ?? 'Password updated');
                })
              }
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Delete"
              onClick={() => {
                if (window.confirm(`Soft-delete user ${r.email}?`)) {
                  void deleteTenantUser.mutateAsync(r.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      });
    }
    return base;
  }, [portal, setStatus, resetPassword, deleteTenantUser]);

  const submitPlatform = async () => {
    setError(null);
    try {
      await createPlatformUser.mutateAsync(form);
      setOpen(false);
      setForm(emptyPlatformUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    }
  };

  const submitTenantCreate = async () => {
    setError(null);
    try {
      await createTenantUser.mutateAsync(tenantForm);
      setOpen(false);
      setTenantForm(emptyTenantForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    }
  };

  const submitTenantEdit = async () => {
    if (!editRow) return;
    setError(null);
    try {
      await updateTenantUser.mutateAsync({ id: editRow.id, payload: editForm });
      setEditRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  };

  const submitAssign = async () => {
    if (!assignRow || !extensionId) return;
    setError(null);
    try {
      await assignExt.mutateAsync({ id: assignRow.id, extensionId });
      setAssignRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign extension');
    }
  };

  const submitUnassign = async () => {
    if (!assignRow) return;
    setError(null);
    try {
      await unassignExt.mutateAsync({ id: assignRow.id });
      setAssignRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove extension');
    }
  };

  return (
    <ModuleAccessGate moduleId="users">
      {({ module }) => (
        <>
          {portal === 'platform' ? (
            <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Tenant</span>
                <select
                  className="h-9 min-w-[10rem] rounded-lg border border-border bg-background px-2 text-sm"
                  value={tenantFilter}
                  onChange={(e) => setTenantFilter(e.target.value)}
                >
                  <option value="">All Tenants</option>
                  {(tenantsQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName || t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Role</span>
                <select
                  className="h-9 min-w-[9rem] rounded-lg border border-border bg-background px-2 text-sm"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All Roles</option>
                  <option value="Tenant Admin">Tenant Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Receptionist">Receptionist</option>
                  <option value="Agent">Agent</option>
                  <option value="User">User</option>
                  <option value="Guest">Guest</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Status</span>
                <select
                  className="h-9 min-w-[8rem] rounded-lg border border-border bg-background px-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="PENDING">Pending</option>
                  <option value="LOCKED">Locked</option>
                </select>
              </label>
            </div>
          ) : null}
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            emptyTitle="No users found"
            emptyDescription={
              portal === 'tenant'
                ? 'Create users so employees can be assigned to extensions.'
                : 'User accounts across all tenants. Use filters above or search.'
            }
            primaryAction={<CreateButton label="Add User" onClick={() => setOpen(true)} />}
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />

          {tempPassword ? (
            <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-border bg-background p-4 shadow-lg">
              <p className="text-sm font-medium">Temporary password</p>
              <p className="mt-1 font-mono text-sm">{tempPassword}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setTempPassword(null)}>
                Dismiss
              </Button>
            </div>
          ) : null}

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
                    onClick={() => void submitPlatform()}
                    disabled={
                      createPlatformUser.isPending ||
                      !form.tenantId ||
                      !form.email ||
                      form.password.length < 8
                    }
                  >
                    {createPlatformUser.isPending ? 'Creating…' : 'Create User'}
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
                  <InputField
                    label="First name"
                    value={form.firstName}
                    onChange={(v) => setForm({ ...form, firstName: v })}
                  />
                  <InputField
                    label="Last name"
                    value={form.lastName}
                    onChange={(v) => setForm({ ...form, lastName: v })}
                  />
                  <InputField
                    label="Email"
                    value={form.email}
                    onChange={(v) => setForm({ ...form, email: v })}
                    type="email"
                  />
                  <InputField
                    label="Password"
                    value={form.password}
                    onChange={(v) => setForm({ ...form, password: v })}
                    type="password"
                  />
                  <InputField
                    label="Role"
                    value={form.roleName}
                    onChange={(v) => setForm({ ...form, roleName: v })}
                  />
                </div>
              </div>
            </SlideOver>
          ) : (
            <>
              <SlideOver
                open={open}
                onClose={() => {
                  setOpen(false);
                  setError(null);
                }}
                title="Add User"
                description="Create an employee account for this tenant."
                footer={
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void submitTenantCreate()}
                      disabled={
                        createTenantUser.isPending ||
                        !tenantForm.email ||
                        !tenantForm.firstName ||
                        tenantForm.password.length < 8
                      }
                    >
                      {createTenantUser.isPending ? 'Creating…' : 'Create User'}
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="First name"
                      value={tenantForm.firstName}
                      onChange={(v) => setTenantForm({ ...tenantForm, firstName: v })}
                    />
                    <InputField
                      label="Last name"
                      value={tenantForm.lastName}
                      onChange={(v) => setTenantForm({ ...tenantForm, lastName: v })}
                    />
                    <InputField
                      label="Email"
                      value={tenantForm.email}
                      onChange={(v) => setTenantForm({ ...tenantForm, email: v })}
                      type="email"
                    />
                    <InputField
                      label="Password"
                      value={tenantForm.password}
                      onChange={(v) => setTenantForm({ ...tenantForm, password: v })}
                      type="password"
                    />
                    <InputField
                      label="Role"
                      value={tenantForm.roleName}
                      onChange={(v) => setTenantForm({ ...tenantForm, roleName: v })}
                    />
                  </div>
                </div>
              </SlideOver>

              <SlideOver
                open={Boolean(editRow)}
                onClose={() => setEditRow(null)}
                title="Edit User"
                footer={
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditRow(null)}>
                      Cancel
                    </Button>
                    <Button onClick={() => void submitTenantEdit()} disabled={updateTenantUser.isPending}>
                      {updateTenantUser.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="First name"
                      value={editForm.firstName}
                      onChange={(v) => setEditForm({ ...editForm, firstName: v })}
                    />
                    <InputField
                      label="Last name"
                      value={editForm.lastName}
                      onChange={(v) => setEditForm({ ...editForm, lastName: v })}
                    />
                    <InputField
                      label="Email"
                      value={editForm.email}
                      onChange={(v) => setEditForm({ ...editForm, email: v })}
                      type="email"
                    />
                    <InputField
                      label="Role"
                      value={editForm.roleName}
                      onChange={(v) => setEditForm({ ...editForm, roleName: v })}
                    />
                  </div>
                </div>
              </SlideOver>

              <SlideOver
                open={Boolean(assignRow)}
                onClose={() => setAssignRow(null)}
                title="Assign Extension"
                description={assignRow ? `User: ${assignRow.email}` : undefined}
                footer={
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void submitUnassign()}
                      disabled={unassignExt.isPending || !assignRow?.extension}
                    >
                      Remove assignment
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setAssignRow(null)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void submitAssign()}
                        disabled={assignExt.isPending || !extensionId}
                      >
                        Assign
                      </Button>
                    </div>
                  </div>
                }
              >
                <div className="space-y-4">
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <p className="text-sm text-muted-foreground">
                    Current: {assignRow?.extension ? formatExtensionLabel(assignRow.extension) : 'None'}
                  </p>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Extension</span>
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      value={extensionId}
                      onChange={(e) => setExtensionId(e.target.value)}
                    >
                      <option value="">Select extension…</option>
                      {extensions.map((ext) => (
                        <option key={String(ext.id)} value={String(ext.id)}>
                          {String(ext.extension ?? ext.name ?? ext.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </SlideOver>
            </>
          )}
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
