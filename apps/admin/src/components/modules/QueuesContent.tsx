'use client';

import { Copy, Download, Eye, Pause, Pencil, Play, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useBulkImportQueues,
  useCloneQueue,
  useCreateQueueCallback,
  useCreateQueueFull,
  useDeleteQueue,
  useEmergencyCloseQueue,
  usePauseQueue,
  useQueueAgentAction,
  useQueueDashboard,
  useResumeQueue,
  useUpdateQueue,
} from '../../lib/hooks/queries/use-queue-ring-mutations';
import { useTenantExtensions, useTenantQueues } from '../../lib/hooks/queries/use-tenant';
import { formatExtensionLabel } from '../../lib/extensions/format-extension-label';
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

type QueueRow = Record<string, unknown> & { id: string };
type DashboardRow = Record<string, unknown> & { id: string };
type Tab = 'queues' | 'dashboard';

const QUEUE_TYPES = ['SALES', 'BILLING', 'TECHNICAL', 'EMERGENCY', 'VIP', 'OUTBOUND'] as const;
const STRATEGIES = [
  'ROUND_ROBIN', 'LEAST_CALLS', 'LONGEST_IDLE', 'RING_ALL', 'PRIORITY',
  'FEWEST_ANSWERED', 'RANDOM', 'WEIGHTED', 'SKILLS_BASED', 'STICKY_AGENT',
] as const;

type QueueForm = {
  name: string;
  code: string;
  description: string;
  queueType: string;
  strategy: string;
  wrapUpSec: string;
  slaTargetSec: string;
  maxWaitSec: string;
  maxQueueLength: string;
  callbackEnabled: boolean;
};

const emptyForm: QueueForm = {
  name: '',
  code: '',
  description: '',
  queueType: 'SALES',
  strategy: 'ROUND_ROBIN',
  wrapUpSec: '0',
  slaTargetSec: '20',
  maxWaitSec: '300',
  maxQueueLength: '50',
  callbackEnabled: false,
};

export function QueuesContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_QUEUES_WRITE);

  const [tab, setTab] = useState<Tab>('dashboard');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<QueueRow | null>(null);
  const [detailRow, setDetailRow] = useState<QueueRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [memberLineId, setMemberLineId] = useState('');
  const [callbackPhone, setCallbackPhone] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const query = useTenantQueues();
  const dashboardQuery = useQueueDashboard();
  const extensionsQuery = useTenantExtensions();
  const create = useCreateQueueFull();
  const update = useUpdateQueue();
  const remove = useDeleteQueue();
  const clone = useCloneQueue();
  const bulkImport = useBulkImportQueues();
  const pauseQueue = usePauseQueue();
  const resumeQueue = useResumeQueue();
  const emergencyClose = useEmergencyCloseQueue();
  const agentAction = useQueueAgentAction();
  const createCallback = useCreateQueueCallback();

  const rows = withRowIds(query.data ?? []) as QueueRow[];
  const dashboardRows = withRowIds(dashboardQuery.data ?? []) as DashboardRow[];
  const extensions = (extensionsQuery.data ?? []) as { line?: { id?: string; name?: string }; extension?: string; lineId?: string }[];

  const columns: Column<QueueRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Queue', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
      { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
      { key: 'type', header: 'Type', cell: (r) => String(r.queueType ?? '—') },
      { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
      { key: 'members', header: 'Agents', cell: (r) => String((r.members as unknown[])?.length ?? 0) },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
      {
        key: 'actions',
        header: '',
        cell: (r) => (
          <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)}><Eye className="h-4 w-4" /></Button>
        ),
      },
    ],
    [],
  );

  const dashboardColumns: Column<DashboardRow>[] = [
    { key: 'name', header: 'Queue', cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
    { key: 'waiting', header: 'Waiting', cell: (r) => String(r.waitingCalls ?? 0) },
    { key: 'available', header: 'Available', cell: (r) => String(r.agentsAvailable ?? 0) },
    { key: 'busy', header: 'Busy', cell: (r) => String(r.agentsBusy ?? 0) },
    { key: 'longest', header: 'Longest wait', cell: (r) => `${r.longestWaitSec ?? 0}s` },
    { key: 'avgWait', header: 'Avg wait', cell: (r) => `${r.averageWaitSec ?? 0}s` },
    { key: 'sla', header: 'SLA', cell: (r) => `${r.slaPct ?? 0}%` },
    { key: 'abandon', header: 'Abandon', cell: (r) => `${r.abandonPct ?? 0}%` },
    { key: 'today', header: 'Calls today', cell: (r) => String(r.callsToday ?? 0) },
  ];

  const openEdit = (row: QueueRow) => {
    setForm({
      name: String(row.name ?? ''),
      code: String(row.code ?? ''),
      description: String(row.description ?? ''),
      queueType: String(row.queueType ?? 'SALES'),
      strategy: String(row.strategy ?? 'ROUND_ROBIN'),
      wrapUpSec: String(row.wrapUpSec ?? '0'),
      slaTargetSec: String(row.slaTargetSec ?? '20'),
      maxWaitSec: String(row.maxWaitSec ?? '300'),
      maxQueueLength: String(row.maxQueueLength ?? '50'),
      callbackEnabled: Boolean(row.callbackEnabled),
    });
    setEditRow(row);
    setError(null);
  };

  const formPayload = () => ({
    name: form.name,
    code: form.code,
    description: form.description || undefined,
    queueType: form.queueType,
    strategy: form.strategy,
    wrapUpSec: Number(form.wrapUpSec) || 0,
    slaTargetSec: Number(form.slaTargetSec) || undefined,
    maxWaitSec: Number(form.maxWaitSec) || undefined,
    maxQueueLength: Number(form.maxQueueLength) || undefined,
    callbackEnabled: form.callbackEnabled,
  });

  const FormFields = () => (
    <div className="space-y-4 text-sm">
      <label className="block space-y-1.5"><span className="font-medium">Name *</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Code *</span><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="font-mono" /></label>
      <label className="block space-y-1.5"><span className="font-medium">Description</span><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label className="block space-y-1.5">
        <span className="font-medium">Queue type</span>
        <select className="h-10 w-full rounded-xl border border-border bg-background px-3" value={form.queueType} onChange={(e) => setForm({ ...form, queueType: e.target.value })}>
          {QUEUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="font-medium">Strategy</span>
        <select className="h-10 w-full rounded-xl border border-border bg-background px-3" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
          {STRATEGIES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5"><span className="font-medium">Wrap-up (sec)</span><Input type="number" value={form.wrapUpSec} onChange={(e) => setForm({ ...form, wrapUpSec: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">SLA target (sec)</span><Input type="number" value={form.slaTargetSec} onChange={(e) => setForm({ ...form, slaTargetSec: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Max wait (sec)</span><Input type="number" value={form.maxWaitSec} onChange={(e) => setForm({ ...form, maxWaitSec: e.target.value })} /></label>
      <label className="block space-y-1.5"><span className="font-medium">Max queue length</span><Input type="number" value={form.maxQueueLength} onChange={(e) => setForm({ ...form, maxQueueLength: e.target.value })} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.callbackEnabled} onChange={(e) => setForm({ ...form, callbackEnabled: e.target.checked })} /> Callback enabled</label>
    </div>
  );

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
  );

  return (
    <ModuleAccessGate moduleId="queues">
      {({ module }) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            {tabBtn('dashboard', 'Live dashboard')}
            {tabBtn('queues', 'Queue builder')}
            {canWrite && tab === 'queues' ? (
              <div className="ml-auto flex gap-2">
                <WriteCreateButton writePermission={PERMISSIONS.TENANT_QUEUES_WRITE} label="Create queue" onClick={() => { setCreateOpen(true); setForm(emptyForm); setError(null); }} />
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" /> Import</Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  const blob = await queueRingRepository.exportQueuesCsv();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'queues.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}><Download className="mr-1 h-4 w-4" /> Export</Button>
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {tab === 'dashboard' ? (
            <ModuleListShell
              module={{ ...module, label: 'Queue dashboard', description: 'Real-time queue depth, SLA, and agent availability' }}
              query={{ ...dashboardQuery, data: dashboardRows }}
              columns={dashboardColumns}
              emptyTitle="No queue metrics"
              emptyDescription="Create queues to monitor live call distribution metrics."
            />
          ) : (
            <ModuleListShell
              module={module}
              query={{ ...query, data: rows }}
              columns={columns}
              emptyTitle="No call queues"
              emptyDescription="Create enterprise queues for sales, support, or emergency routing."
            />
          )}

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Create queue">
            <FormFields />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={async () => { try { await create.mutateAsync(formPayload()); setCreateOpen(false); } catch (e) { setError(e instanceof Error ? e.message : 'Create failed'); } }} disabled={!form.name || !form.code || create.isPending}>Create</Button>
            </div>
          </SlideOver>

          <SlideOver open={Boolean(editRow)} onClose={() => setEditRow(null)} title="Edit queue">
            <FormFields />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={async () => { if (!editRow) return; try { await update.mutateAsync({ id: editRow.id, payload: formPayload() }); setEditRow(null); } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); } }} disabled={update.isPending}>Save</Button>
            </div>
          </SlideOver>

          <SlideOver open={Boolean(detailRow)} onClose={() => { setDetailRow(null); setMemberLineId(''); setCallbackPhone(''); }} title="Queue details" width="lg">
            {detailRow ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Name</span><p className="font-medium">{String(detailRow.name)}</p></div>
                  <div><span className="text-muted-foreground">Code</span><p className="font-mono">{String(detailRow.code)}</p></div>
                  <div><span className="text-muted-foreground">Type</span><p>{String(detailRow.queueType)}</p></div>
                  <div><span className="text-muted-foreground">Strategy</span><p>{String(detailRow.strategy)}</p></div>
                  <div><span className="text-muted-foreground">Status</span><p>{String(detailRow.status)}</p></div>
                  <div><span className="text-muted-foreground">SLA target</span><p>{String(detailRow.slaTargetSec ?? '—')}s</p></div>
                </div>

                <div>
                  <h4 className="mb-2 font-medium">Agents</h4>
                  <ul className="space-y-1">
                    {((detailRow.members as { id: string; status?: string; line?: { name?: string; extension?: { extension?: string } } }[]) ?? []).map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <span>
                          {formatExtensionLabel(
                            String(m.line?.extension?.extension ?? ''),
                            m.line?.name,
                          )}{' '}
                          · {m.status}
                        </span>
                        {canWrite ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => agentAction.mutate({ action: 'pause', queueId: detailRow.id, memberId: m.id, reason: 'Break' })}><Pause className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => agentAction.mutate({ action: 'resume', queueId: detailRow.id, memberId: m.id })}><Play className="h-4 w-4" /></Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {canWrite ? (
                    <div className="mt-3 flex gap-2">
                      <select className="h-10 flex-1 rounded-xl border border-border bg-background px-3" value={memberLineId} onChange={(e) => setMemberLineId(e.target.value)}>
                        <option value="">Add agent line…</option>
                        {extensions.map((ext, i) => {
                          const lineId = ext.line?.id ?? ext.lineId ?? '';
                          return (
                            <option key={i} value={lineId}>
                              {formatExtensionLabel(
                                String(ext.extension ?? ''),
                                (ext.line as { name?: string })?.name,
                              )}
                            </option>
                          );
                        })}
                      </select>
                      <Button disabled={!memberLineId} onClick={async () => {
                        await queueRingRepository.addQueueMember(detailRow.id, { lineId: memberLineId });
                        setMemberLineId('');
                        query.refetch();
                      }}>Add</Button>
                    </div>
                  ) : null}
                </div>

                {Boolean(detailRow.callbackEnabled) && canWrite ? (
                  <div>
                    <h4 className="mb-2 font-medium">Schedule callback</h4>
                    <div className="flex gap-2">
                      <Input value={callbackPhone} onChange={(e) => setCallbackPhone(e.target.value)} placeholder="+15551234567" />
                      <Button disabled={!callbackPhone} onClick={async () => {
                        await createCallback.mutateAsync({ queueId: detailRow.id, payload: { phoneNumber: callbackPhone } });
                        setCallbackPhone('');
                      }}>Schedule</Button>
                    </div>
                  </div>
                ) : null}

                {canWrite ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button variant="outline" size="sm" onClick={() => openEdit(detailRow)}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => pauseQueue.mutate(detailRow.id)}><Pause className="mr-1 h-4 w-4" /> Pause</Button>
                    <Button variant="outline" size="sm" onClick={() => resumeQueue.mutate(detailRow.id)}><Play className="mr-1 h-4 w-4" /> Resume</Button>
                    <Button variant="outline" size="sm" onClick={() => emergencyClose.mutate(detailRow.id)}><ShieldAlert className="mr-1 h-4 w-4" /> Emergency close</Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      const name = prompt('Clone name?', `${detailRow.name} Copy`);
                      const code = prompt('Clone code?', `${detailRow.code}_copy`);
                      if (!name || !code) return;
                      await clone.mutateAsync({ id: detailRow.id, name, code });
                      setDetailRow(null);
                    }}><Copy className="mr-1 h-4 w-4" /> Clone</Button>
                    <Button variant="destructive" size="sm" onClick={async () => {
                      if (!confirm('Delete this queue?')) return;
                      await remove.mutateAsync(detailRow.id);
                      setDetailRow(null);
                    }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </SlideOver>

          <SlideOver open={importOpen} onClose={() => setImportOpen(false)} title="Bulk import queues">
            <textarea className="min-h-48 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'[\n  { "name": "Sales", "code": "sales", "queueType": "SALES", "strategy": "ROUND_ROBIN" }\n]'} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                try {
                  const parsed = JSON.parse(importText) as Record<string, unknown>[];
                  await bulkImport.mutateAsync(parsed);
                  setImportOpen(false);
                  setImportText('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Import failed');
                }
              }}>Import</Button>
            </div>
          </SlideOver>
        </div>
      )}
    </ModuleAccessGate>
  );
}
