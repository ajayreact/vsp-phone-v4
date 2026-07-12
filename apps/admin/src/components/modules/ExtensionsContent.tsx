'use client';

import { Download, Pencil, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useBulkImportExtensions,
  useCreateTenantExtension,
  useDeleteTenantExtension,
  useUpdateTenantExtension,
} from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantExtensions, useTenantUsers } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import {
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';
import { WriteCreateButton } from './shared/TenantCreateForms';
import { formatExtensionLabel } from '../../lib/extensions/format-extension-label';

type ExtensionRow = Record<string, unknown> & { id: string };

type ExtensionForm = {
  userId: string;
  extension: string;
  lineName: string;
  callerIdName: string;
  emergencyCallerIdName: string;
  callForwardEnabled: boolean;
  callForwardDestination: string;
  dndEnabled: boolean;
  voicemailNotifyEmail: string;
};

const emptyForm: ExtensionForm = {
  userId: '',
  extension: '',
  lineName: '',
  callerIdName: '',
  emergencyCallerIdName: '',
  callForwardEnabled: false,
  callForwardDestination: '',
  dndEnabled: false,
  voicemailNotifyEmail: '',
};

function displayUser(user: { email?: string; profile?: { displayName?: string; firstName?: string; lastName?: string } } | undefined) {
  if (!user) return '—';
  if (user.profile?.displayName) return user.profile.displayName;
  if (user.profile?.firstName) return `${user.profile.firstName} ${user.profile.lastName ?? ''}`.trim();
  return user.email ?? '—';
}

function ExtensionFormFields({
  form,
  setForm,
  users,
  editMode,
}: {
  form: ExtensionForm;
  setForm: (f: ExtensionForm) => void;
  users: { id: string; email: string; displayName?: string; name?: string }[];
  editMode?: boolean;
}) {
  return (
    <div className="space-y-4">
      {!editMode ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">User *</span>
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
          >
            <option value="">Select user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.name || u.email}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Extension *</span>
        <Input value={form.extension} onChange={(e) => setForm({ ...form, extension: e.target.value })} placeholder="101" />
      </label>
      {!editMode ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Line name</span>
          <Input value={form.lineName} onChange={(e) => setForm({ ...form, lineName: e.target.value })} placeholder="Sales — Jane" />
        </label>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Caller ID name</span>
        <Input value={form.callerIdName} onChange={(e) => setForm({ ...form, callerIdName: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Emergency caller ID name</span>
        <Input value={form.emergencyCallerIdName} onChange={(e) => setForm({ ...form, emergencyCallerIdName: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.callForwardEnabled} onChange={(e) => setForm({ ...form, callForwardEnabled: e.target.checked })} />
        Call forwarding enabled
      </label>
      {form.callForwardEnabled ? (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Forward to</span>
          <Input value={form.callForwardDestination} onChange={(e) => setForm({ ...form, callForwardDestination: e.target.value })} placeholder="102 or +15551234567" />
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.dndEnabled} onChange={(e) => setForm({ ...form, dndEnabled: e.target.checked })} />
        Do not disturb
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Voicemail notification email</span>
        <Input type="email" value={form.voicemailNotifyEmail} onChange={(e) => setForm({ ...form, voicemailNotifyEmail: e.target.value })} />
      </label>
    </div>
  );
}

function formToPayload(form: ExtensionForm, editMode?: boolean) {
  const settings = {
    callForwardEnabled: form.callForwardEnabled,
    callForwardDestination: form.callForwardDestination || undefined,
    dndEnabled: form.dndEnabled,
    voicemailNotifyEmail: form.voicemailNotifyEmail || undefined,
  };
  if (editMode) {
    return {
      extension: form.extension,
      callerIdName: form.callerIdName || undefined,
      emergencyCallerIdName: form.emergencyCallerIdName || undefined,
      settings,
    };
  }
  return {
    userId: form.userId,
    extension: form.extension,
    lineName: form.lineName || undefined,
    callerIdName: form.callerIdName || undefined,
    emergencyCallerIdName: form.emergencyCallerIdName || undefined,
    settings,
  };
}

export function ExtensionsContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_EXTENSIONS_WRITE);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<ExtensionRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const query = useTenantExtensions(search);
  const usersQuery = useTenantUsers();
  const create = useCreateTenantExtension();
  const update = useUpdateTenantExtension();
  const remove = useDeleteTenantExtension();
  const bulkImport = useBulkImportExtensions();

  const rows = withRowIds(query.data ?? []) as ExtensionRow[];
  const users = (usersQuery.data ?? []) as { id: string; email: string; displayName?: string; name?: string }[];

  const openEdit = (row: ExtensionRow) => {
    const line = row.line as {
      name?: string;
      callerId?: { callerIdName?: string; emergencyCallerIdName?: string };
      telephonySettings?: {
        callForwardEnabled?: boolean;
        callForwardDestination?: string;
        dndEnabled?: boolean;
        voicemailNotifyEmail?: string;
      };
    };
    setForm({
      userId: '',
      extension: String(row.extension ?? ''),
      lineName: line?.name ?? '',
      callerIdName: line?.callerId?.callerIdName ?? '',
      emergencyCallerIdName: line?.callerId?.emergencyCallerIdName ?? '',
      callForwardEnabled: line?.telephonySettings?.callForwardEnabled ?? false,
      callForwardDestination: line?.telephonySettings?.callForwardDestination ?? '',
      dndEnabled: line?.telephonySettings?.dndEnabled ?? false,
      voicemailNotifyEmail: line?.telephonySettings?.voicemailNotifyEmail ?? '',
    });
    setEditRow(row);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this extension?')) return;
    await remove.mutateAsync(id);
  };

  const columns: Column<ExtensionRow>[] = useMemo(
    () => [
      {
        key: 'extension',
        header: 'Extension',
        sortable: true,
        cell: (r) => {
          const line = r.line as { name?: string } | undefined;
          return (
            <span className="font-mono font-medium">
              {formatExtensionLabel(String(r.extension ?? ''), line?.name)}
            </span>
          );
        },
      },
      {
        key: 'user',
        header: 'User',
        cell: (r) => displayUser((r.line as { user?: Parameters<typeof displayUser>[0] })?.user),
      },
      {
        key: 'line',
        header: 'Line',
        cell: (r) => String((r.line as { name?: string })?.name ?? '—'),
      },
      {
        key: 'callerId',
        header: 'Caller ID',
        cell: (r) => String((r.line as { callerId?: { callerIdName?: string } })?.callerId?.callerIdName ?? '—'),
      },
      {
        key: 'presence',
        header: 'Presence',
        cell: (r) => {
          const status = (r.line as { presence?: { status?: string } })?.presence?.status ?? 'OFFLINE';
          return <StatusBadge status={status === 'AVAILABLE' ? 'online' : status === 'DND' ? 'offline' : 'pending'} />;
        },
      },
      {
        key: 'forward',
        header: 'Forward',
        cell: (r) => {
          const s = (r.line as { telephonySettings?: { callForwardEnabled?: boolean; callForwardDestination?: string } })?.telephonySettings;
          return s?.callForwardEnabled ? String(s.callForwardDestination ?? 'On') : 'Off';
        },
      },
      ...(canWrite
        ? [
            {
              key: 'actions',
              header: '',
              cell: (r: ExtensionRow) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => void handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ),
            } as Column<ExtensionRow>,
          ]
        : []),
    ],
    [canWrite, remove],
  );

  const handleExport = async () => {
    const { tenantRepository } = await import('../../lib/repositories/tenant.repository');
    const blob = await tenantRepository.exportExtensionsCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extensions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitCreate = async () => {
    setError(null);
    try {
      await create.mutateAsync(formToPayload(form));
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create extension');
    }
  };

  const submitEdit = async () => {
    if (!editRow) return;
    setError(null);
    try {
      await update.mutateAsync({ id: editRow.id, payload: formToPayload(form, true) });
      setEditRow(null);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update extension');
    }
  };

  const submitImport = async () => {
    setError(null);
    try {
      const rows = JSON.parse(importText) as { extension: string; userId: string; lineName?: string; callerIdName?: string }[];
      await bulkImport.mutateAsync(rows);
      setImportOpen(false);
      setImportText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid import JSON');
    }
  };

  return (
    <ModuleAccessGate moduleId="extensions">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search extensions, users, lines…"
            emptyTitle="No extensions"
            emptyDescription="Add extension numbers and assign them to users."
            primaryAction={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void handleExport()}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                {canWrite ? (
                  <Button variant="outline" size="sm" onClick={() => { setImportOpen(true); setError(null); }}>
                    <Upload className="h-4 w-4" />
                    Import
                  </Button>
                ) : null}
                <WriteCreateButton
                  writePermission={PERMISSIONS.TENANT_EXTENSIONS_WRITE}
                  label="Add Extension"
                  onClick={() => { setCreateOpen(true); setForm(emptyForm); setError(null); }}
                />
              </div>
            }
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />

          <SlideOver
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            title="Add Extension"
            description="Creates a line, extension, and default telephony settings for the user."
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => void submitCreate()} disabled={create.isPending || !form.userId || !form.extension.trim()}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            }
          >
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
            <ExtensionFormFields form={form} setForm={setForm} users={users} />
          </SlideOver>

          <SlideOver
            open={Boolean(editRow)}
            onClose={() => setEditRow(null)}
            title="Edit Extension"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
                <Button onClick={() => void submitEdit()} disabled={update.isPending || !form.extension.trim()}>
                  {update.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            }
          >
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
            <ExtensionFormFields form={form} setForm={setForm} users={users} editMode />
          </SlideOver>

          <SlideOver
            open={importOpen}
            onClose={() => setImportOpen(false)}
            title="Bulk Import Extensions"
            description='Paste a JSON array: [{ "extension": "101", "userId": "...", "lineName": "...", "callerIdName": "..." }]'
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button onClick={() => void submitImport()} disabled={bulkImport.isPending || !importText.trim()}>
                  {bulkImport.isPending ? 'Importing…' : 'Import'}
                </Button>
              </div>
            }
          >
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
            <textarea
              className="min-h-[240px] w-full rounded-xl border border-border bg-background p-3 font-mono text-xs"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}
