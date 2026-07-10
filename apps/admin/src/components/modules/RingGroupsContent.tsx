'use client';

import { Copy, Download, Eye, Pencil, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useBulkImportRingGroups,
  useCloneRingGroup,
  useCreateRingGroup,
  useDeleteRingGroup,
  useUpdateRingGroup,
} from '../../lib/hooks/queries/use-queue-ring-mutations';
import { useTenantExtensions, useTenantRingGroups } from '../../lib/hooks/queries/use-tenant';
import { queueRingRepository } from '../../lib/repositories/queue-ring.repository';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { WriteCreateButton } from './shared/TenantCreateForms';

type RingGroupRow = Record<string, unknown> & { id: string };

const STRATEGIES = [
  'SEQUENTIAL', 'SIMULTANEOUS', 'ROUND_ROBIN', 'LONGEST_IDLE', 'WEIGHTED',
  'RANDOM', 'PRIORITY', 'BROADCAST', 'CASCADE', 'FAILOVER',
] as const;

type RingGroupForm = {
  name: string;
  description: string;
  extension: string;
  strategy: string;
  timeoutSec: string;
  retryCount: string;
  maxCycles: string;
  callerIdName: string;
};

const emptyForm: RingGroupForm = {
  name: '',
  description: '',
  extension: '',
  strategy: 'SIMULTANEOUS',
  timeoutSec: '30',
  retryCount: '0',
  maxCycles: '1',
  callerIdName: '',
};

export function RingGroupsContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_ROUTING_WRITE);

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<RingGroupRow | null>(null);
  const [detailRow, setDetailRow] = useState<RingGroupRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [memberExtId, setMemberExtId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const query = useTenantRingGroups();
  const extensionsQuery = useTenantExtensions();
  const create = useCreateRingGroup();
  const update = useUpdateRingGroup();
  const remove = useDeleteRingGroup();
  const clone = useCloneRingGroup();
  const bulkImport = useBulkImportRingGroups();

  const rows = withRowIds(query.data ?? []) as RingGroupRow[];
  const extensions = (extensionsQuery.data ?? []) as { id: string; extension?: string; line?: { name?: string } }[];

  const columns: Column<RingGroupRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Ring Group', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
      { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
      { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
      { key: 'members', header: 'Members', cell: (r) => String((r.members as unknown[])?.length ?? 0) },
      { key: 'timeout', header: 'Timeout', cell: (r) => (r.timeoutSec != null ? `${r.timeoutSec}s` : '—') },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'offline'} /> },
      {
        key: 'actions',
        header: '',
        cell: (r) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)}><Eye className="h-4 w-4" /></Button>
            {canWrite ? (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canWrite],
  );

  const openEdit = (row: RingGroupRow) => {
    setForm({
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      extension: String(row.extension ?? ''),
      strategy: String(row.strategy ?? 'SIMULTANEOUS'),
      timeoutSec: String(row.timeoutSec ?? '30'),
      retryCount: String(row.retryCount ?? '0'),
      maxCycles: String(row.maxCycles ?? '1'),
      callerIdName: String(row.callerIdName ?? ''),
    });
    setEditRow(row);
    setError(null);
  };

  const formPayload = () => ({
    name: form.name,
    description: form.description || undefined,
    extension: form.extension || undefined,
    strategy: form.strategy,
    timeoutSec: Number(form.timeoutSec) || 30,
    retryCount: Number(form.retryCount) || 0,
    maxCycles: Number(form.maxCycles) || 1,
    callerIdName: form.callerIdName || undefined,
  });

  const handleCreate = async () => {
    setError(null);
    try {
      await create.mutateAsync(formPayload());
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    setError(null);
    try {
      await update.mutateAsync({ id: editRow.id, payload: formPayload() });
      setEditRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleImport = async () => {
    setError(null);
    try {
      const parsed = JSON.parse(importText) as Record<string, unknown>[];
      await bulkImport.mutateAsync(parsed);
      setImportOpen(false);
      setImportText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const handleExport = async () => {
    const blob = await queueRingRepository.exportRingGroupsCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ring-groups.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const FormFields = () => (
    <div className="space-y-4 text-sm">
      <label className="block space-y-1.5"><span className="font-medium">Name *</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Description</span><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Extension</span><Input value={form.extension} onChange={(e) => setForm({ ...form, extension: e.target.value })} placeholder="600" /></label>
      <label className="block space-y-1.5">
        <span className="font-medium">Strategy</span>
        <select className="h-10 w-full rounded-xl border border-border bg-background px-3" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
          {STRATEGIES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5"><span className="font-medium">Timeout (sec)</span><Input type="number" value={form.timeoutSec} onChange={(e) => setForm({ ...form, timeoutSec: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Retry count</span><Input type="number" value={form.retryCount} onChange={(e) => setForm({ ...form, retryCount: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Max cycles</span><Input type="number" value={form.maxCycles} onChange={(e) => setForm({ ...form, maxCycles: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Caller ID name</span><Input value={form.callerIdName} onChange={(e) => setForm({ ...form, callerIdName: e.target.value })} /></label>
    </div>
  );

  return (
    <ModuleAccessGate moduleId="ring-groups">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No ring groups"
            emptyDescription="Create hunt groups with sequential, simultaneous, or round-robin strategies."
            headerActions={
              canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <WriteCreateButton writePermission={PERMISSIONS.TENANT_ROUTING_WRITE} label="Create Ring Group" onClick={() => { setCreateOpen(true); setForm(emptyForm); setError(null); }} />
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" /> Import</Button>
                  <Button variant="outline" size="sm" onClick={() => void handleExport()}><Download className="mr-1 h-4 w-4" /> Export</Button>
                </div>
              ) : undefined
            }
          />

          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Create ring group"><FormFields /><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={!form.name || create.isPending}>Create</Button></div></SlideOver>
          <SlideOver open={Boolean(editRow)} onClose={() => setEditRow(null)} title="Edit ring group"><FormFields /><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button><Button onClick={handleUpdate} disabled={update.isPending}>Save</Button></div></SlideOver>

          <SlideOver open={Boolean(detailRow)} onClose={() => { setDetailRow(null); setMemberExtId(''); }} title="Ring group details" width="lg">
            {detailRow ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Name</span><p className="font-medium">{String(detailRow.name)}</p></div>
                  <div><span className="text-muted-foreground">Strategy</span><p>{String(detailRow.strategy)}</p></div>
                  <div><span className="text-muted-foreground">Extension</span><p>{String(detailRow.extension ?? '—')}</p></div>
                  <div><span className="text-muted-foreground">Timeout</span><p>{String(detailRow.timeoutSec)}s</p></div>
                </div>
                <div>
                  <h4 className="mb-2 font-medium">Members</h4>
                  <ul className="space-y-1">
                    {((detailRow.members as { id: string; extension?: { extension?: string }; priority?: number; enabled?: boolean }[]) ?? []).map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <span>Ext {m.extension?.extension ?? '—'} · priority {m.priority ?? 0}</span>
                        {canWrite ? (
                          <Button variant="ghost" size="sm" onClick={async () => {
                            await queueRingRepository.removeRingGroupMember(detailRow.id, m.id);
                            query.refetch();
                          }}><Trash2 className="h-4 w-4" /></Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {canWrite ? (
                    <div className="mt-3 flex gap-2">
                      <select className="h-10 flex-1 rounded-xl border border-border bg-background px-3" value={memberExtId} onChange={(e) => setMemberExtId(e.target.value)}>
                        <option value="">Add extension…</option>
                        {extensions.map((ext) => <option key={ext.id} value={ext.id}>{ext.extension} — {ext.line?.name ?? 'Line'}</option>)}
                      </select>
                      <Button disabled={!memberExtId} onClick={async () => {
                        await queueRingRepository.addRingGroupMember(detailRow.id, { extensionId: memberExtId });
                        setMemberExtId('');
                        query.refetch();
                        setDetailRow({ ...detailRow, members: [...((detailRow.members as unknown[]) ?? [])] });
                      }}>Add</Button>
                    </div>
                  ) : null}
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button variant="outline" size="sm" onClick={async () => {
                      const name = prompt('Clone name?', `${detailRow.name} Copy`);
                      if (!name) return;
                      await clone.mutateAsync({ id: detailRow.id, name });
                      setDetailRow(null);
                    }}><Copy className="mr-1 h-4 w-4" /> Clone</Button>
                    <Button variant="destructive" size="sm" onClick={async () => {
                      if (!confirm('Delete this ring group?')) return;
                      await remove.mutateAsync(detailRow.id);
                      setDetailRow(null);
                    }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </SlideOver>

          <SlideOver open={importOpen} onClose={() => setImportOpen(false)} title="Bulk import ring groups">
            <textarea className="min-h-48 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'[\n  { "name": "Sales Hunt", "strategy": "SEQUENTIAL", "memberExtensions": ["101","102"] }\n]'} />
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={handleImport}>Import</Button></div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}
