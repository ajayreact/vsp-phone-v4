'use client';

import { AlertTriangle, Megaphone, Mic2, Plus, Radio, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import {
  useCreatePagingGroup,
  useDeletePagingGroup,
  usePagingGroups,
  usePagingReports,
} from '../../lib/hooks/queries/use-paging';
import { useTenantDevices } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { cn } from '../../lib/utils/cn';
import type { Column } from '../data/DataTable';
import { DataTable } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { ModuleAccessGate } from './shared/ModuleShell';
import { useLineOptionsFromDevices } from './shared/TenantCreateForms';

type TabId = 'paging' | 'intercom';
type Row = Record<string, unknown> & { id: string };

const PAGING_TYPES = ['MULTICAST', 'SIP', 'ZONE', 'DEPARTMENT', 'EMERGENCY', 'PRIORITY'] as const;
const INTERCOM_MODES = ['ONE_WAY', 'TWO_WAY'] as const;

export function PagingIntercomContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_PAGING_WRITE);

  const [tab, setTab] = useState<TabId>('paging');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    code: '',
    pagingType: 'SIP',
    zone: '',
    department: '',
    priorityLevel: '100',
    multicastAddress: '',
    intercomMode: 'ONE_WAY',
    autoAnswer: true,
    whisperEnabled: false,
    pushToTalk: false,
    targetLineId: '',
    memberLineIds: [] as string[],
  });

  const kind = tab === 'paging' ? 'PAGING' : 'INTERCOM';
  const groupsQuery = usePagingGroups(kind);
  const reportsQuery = usePagingReports();
  const devicesQuery = useTenantDevices();
  const lineOptions = useLineOptionsFromDevices(devicesQuery.data ?? []);
  const createGroup = useCreatePagingGroup();
  const deleteGroup = useDeletePagingGroup();

  const rows = useMemo(() => {
    const list = (groupsQuery.data ?? []) as Row[];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        String(r.name ?? '').toLowerCase().includes(q) ||
        String(r.code ?? '').toLowerCase().includes(q),
    );
  }, [groupsQuery.data, search]);

  const handleCreate = async () => {
    setError(null);
    try {
      await createGroup.mutateAsync({
        name: form.name,
        code: form.code,
        kind,
        ...(tab === 'paging'
          ? {
              pagingType: form.pagingType,
              zone: form.zone || undefined,
              department: form.department || undefined,
              priorityLevel: Number(form.priorityLevel) || 100,
              multicastAddress: form.multicastAddress || undefined,
              members: form.memberLineIds.map((lineId) => ({ lineId })),
            }
          : {
              intercomMode: form.intercomMode,
              autoAnswer: form.autoAnswer,
              whisperEnabled: form.whisperEnabled,
              pushToTalk: form.pushToTalk,
              targetLineId: form.targetLineId || undefined,
            }),
      });
      setCreateOpen(false);
      setForm({
        name: '',
        code: '',
        pagingType: 'SIP',
        zone: '',
        department: '',
        priorityLevel: '100',
        multicastAddress: '',
        intercomMode: 'ONE_WAY',
        autoAnswer: true,
        whisperEnabled: false,
        pushToTalk: false,
        targetLineId: '',
        memberLineIds: [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', cell: (r) => String(r.name ?? '—') },
    { key: 'code', header: 'Code', cell: (r) => <code className="text-xs">{String(r.code)}</code> },
    {
      key: 'type',
      header: 'Type',
      cell: (r) =>
        tab === 'paging' ? (
          <Badge variant={r.pagingType === 'EMERGENCY' ? 'destructive' : 'default'}>
            {String(r.pagingType ?? 'SIP')}
          </Badge>
        ) : (
          String(r.intercomMode ?? 'ONE_WAY')
        ),
    },
    {
      key: 'zone',
      header: 'Zone / Dept',
      cell: (r) => String(r.zone ?? r.department ?? '—'),
    },
    {
      key: 'members',
      header: tab === 'paging' ? 'Members' : 'Target',
      cell: (r) =>
        tab === 'paging'
          ? String((r.members as unknown[] | undefined)?.length ?? 0)
          : String((r.targetLine as { name?: string } | undefined)?.name ?? '—'),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) =>
        canWrite ? (
          <Button size="sm" variant="ghost" onClick={() => void deleteGroup.mutateAsync(r.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null,
    },
  ];

  const reports = reportsQuery.data ?? {};

  return (
    <ModuleAccessGate moduleId="paging-intercom">
      {() => (
      <PageContainer>
        <PageHeader
          title="Paging & Intercom"
          description="Multicast and SIP paging groups, zone/department paging, emergency broadcast, and intercom endpoints."
          actions={
            canWrite ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New {tab === 'paging' ? 'paging group' : 'intercom'}
              </Button>
            ) : null
          }
        />

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Paging groups" value={String(reports.pagingCount ?? '—')} icon={Megaphone} />
          <MetricCard label="Intercom" value={String(reports.intercomCount ?? '—')} icon={Mic2} />
          <MetricCard label="Emergency" value={String(reports.emergencyCount ?? '—')} icon={AlertTriangle} />
          <MetricCard label="Zones" value={String(reports.zoneCount ?? '—')} icon={Radio} />
        </div>

        <div className="mb-4 flex gap-2">
          {(['paging', 'intercom'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <Input
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 max-w-sm"
        />

        {error ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <QueryState
          isLoading={groupsQuery.isLoading}
          isError={groupsQuery.isError}
          error={groupsQuery.error}
          isEmpty={!rows.length}
          empty={
            <EmptyState
              title={tab === 'paging' ? 'No paging groups' : 'No intercom endpoints'}
              description="Configure feature codes synced to the live PBX runtime."
            />
          }
        >
          <DataTable columns={columns} data={rows} />
        </QueryState>

        <SlideOver
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title={tab === 'paging' ? 'New paging group' : 'New intercom endpoint'}
        >
          <div className="space-y-4">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Feature code (e.g. 801)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            {tab === 'paging' ? (
              <>
                <select
                  value={form.pagingType}
                  onChange={(e) => setForm({ ...form, pagingType: e.target.value })}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                >
                  {PAGING_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Input placeholder="Zone (optional)" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
                <Input placeholder="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                <Input placeholder="Multicast address (optional)" value={form.multicastAddress} onChange={(e) => setForm({ ...form, multicastAddress: e.target.value })} />
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Member lines</span>
                  <select
                    multiple
                    value={form.memberLineIds}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        memberLineIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                      })
                    }
                    className="h-32 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    {lineOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <select
                  value={form.intercomMode}
                  onChange={(e) => setForm({ ...form, intercomMode: e.target.value })}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                >
                  {INTERCOM_MODES.map((m) => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
                <select
                  value={form.targetLineId}
                  onChange={(e) => setForm({ ...form, targetLineId: e.target.value })}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <option value="">Select target line</option>
                  {lineOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.autoAnswer} onChange={(e) => setForm({ ...form, autoAnswer: e.target.checked })} />
                  Auto-answer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.whisperEnabled} onChange={(e) => setForm({ ...form, whisperEnabled: e.target.checked })} />
                  Whisper
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.pushToTalk} onChange={(e) => setForm({ ...form, pushToTalk: e.target.checked })} />
                  Push-to-talk
                </label>
              </>
            )}
            <Button className="w-full" onClick={() => void handleCreate()} disabled={!form.name.trim() || !form.code.trim()}>
              Create
            </Button>
          </div>
        </SlideOver>
      </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
