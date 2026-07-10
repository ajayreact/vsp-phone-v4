'use client';

import { Copy, Download, Eye, Pencil, Trash2, Upload, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useCloneIvr,
  useCreateIvr,
  useDeleteIvr,
} from '../../lib/hooks/queries/use-ivr-routing-mutations';
import { useTenantIvrs } from '../../lib/hooks/queries/use-tenant';
import { ivrRoutingRepository } from '../../lib/repositories/ivr-routing.repository';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { WriteCreateButton } from './shared/TenantCreateForms';

type IvrRow = Record<string, unknown> & { id: string };

export function IvrContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_IVR_WRITE);

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [error, setError] = useState<string | null>(null);

  const query = useTenantIvrs();
  const create = useCreateIvr();
  const remove = useDeleteIvr();
  const clone = useCloneIvr();

  const rows = withRowIds(query.data ?? []) as IvrRow[];

  const columns: Column<IvrRow>[] = useMemo(
    () => [
      { key: 'name', header: 'IVR', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
      { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
      { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
      { key: 'flowStatus', header: 'Flow', cell: (r) => <StatusBadge status={String(r.flowStatus ?? 'DRAFT') === 'PUBLISHED' ? 'active' : 'pending'} /> },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'offline'} /> },
      {
        key: 'actions',
        header: '',
        cell: (r) => (
          <div className="flex gap-1">
            <Link href={`/ivr/${r.id}`}>
              <Button variant="ghost" size="sm"><Workflow className="h-4 w-4" /></Button>
            </Link>
            {canWrite ? (
              <>
                <Button variant="ghost" size="sm" onClick={async () => {
                  const name = `${String(r.name)} (Copy)`;
                  const code = `${String(r.code)}-copy`;
                  await clone.mutateAsync({ id: r.id, payload: { name, code } });
                }}><Copy className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={async () => {
                  if (confirm('Delete this IVR?')) await remove.mutateAsync(r.id);
                }}><Trash2 className="h-4 w-4" /></Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canWrite, clone, remove],
  );

  const handleCreate = async () => {
    setError(null);
    try {
      await create.mutateAsync({
        name: form.name,
        code: form.code,
        description: form.description || undefined,
      });
      setCreateOpen(false);
      setForm({ name: '', code: '', description: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleImport = async () => {
    setError(null);
    try {
      const rows = JSON.parse(importText) as Record<string, unknown>[];
      await ivrRoutingRepository.bulkImportIvrs(rows);
      setImportOpen(false);
      setImportText('');
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  return (
    <ModuleAccessGate moduleId="ivr">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No IVR flows"
            emptyDescription="Create a visual IVR flow to build interactive call experiences."
            primaryAction={
              canWrite ? (
                <div className="flex gap-2">
                  <WriteCreateButton writePermission={PERMISSIONS.TENANT_IVR_WRITE} label="Create IVR" onClick={() => setCreateOpen(true)} />
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Import</Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    const res = await ivrRoutingRepository.exportIvrsJson();
                    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'ivrs-export.json';
                    a.click();
                  }}><Download className="mr-1 h-4 w-4" />Export</Button>
                </div>
              ) : undefined
            }
          />

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Create IVR" description="Add a new visual IVR flow.">
            <div className="space-y-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button onClick={() => void handleCreate()} disabled={create.isPending || !form.name || !form.code}>
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </SlideOver>

          <SlideOver open={importOpen} onClose={() => setImportOpen(false)} title="Import IVRs" description="Paste JSON array of IVR definitions.">
            <div className="space-y-3">
              <textarea className="h-48 w-full rounded border p-2 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button onClick={() => void handleImport()}>Import</Button>
            </div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}
