'use client';

import {
  Bookmark,
  Download,
  Flag,
  Mic,
  Play,
  Shield,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import {
  useCreateRecordingPolicy,
  useDeleteRecordingPolicy,
  useRecordingActions,
  useRecordingPolicies,
  useRecordingReports,
  useTenantRecordingPlayback,
  useTenantRecordingsSearch,
} from '../../lib/hooks/queries/use-vcr-communications';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import type { Column } from '../data/DataTable';
import { DataTable } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { Skeleton } from '../ui/Skeleton';
import { ModuleAccessGate } from './shared/ModuleShell';
import { WriteCreateButton } from './shared/TenantCreateForms';

type RecordingRow = Record<string, unknown> & { id: string };
type PolicyRow = Record<string, unknown> & { id: string };

const POLICY_MODES = ['ALWAYS', 'ON_DEMAND', 'NEVER', 'QUEUE', 'IVR', 'EXTENSION', 'SUPERVISOR'] as const;

type PolicyForm = {
  name: string;
  policyMode: string;
  lineId: string;
  retentionDays: string;
  archiveAfterDays: string;
  recordingEnabled: boolean;
  recordInbound: boolean;
  recordOutbound: boolean;
  legalHoldDefault: boolean;
};

const emptyPolicyForm: PolicyForm = {
  name: '',
  policyMode: 'ON_DEMAND',
  lineId: '',
  retentionDays: '90',
  archiveAfterDays: '365',
  recordingEnabled: true,
  recordInbound: true,
  recordOutbound: true,
  legalHoldDefault: false,
};

export function RecordingsContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_RECORDINGS_WRITE);
  const canManagePolicies = hasPermission(permissions, PERMISSIONS.TENANT_RECORDING_POLICIES_WRITE);

  const [tab, setTab] = useState<'recordings' | 'policies'>('recordings');
  const [search, setSearch] = useState('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [legalHoldOnly, setLegalHoldOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [error, setError] = useState<string | null>(null);

  const recordingsQuery = useTenantRecordingsSearch({
    search: search || undefined,
    bookmarkedOnly,
    legalHoldOnly,
    limit: 200,
  });
  const reportsQuery = useRecordingReports();
  const policiesQuery = useRecordingPolicies();
  const playback = useTenantRecordingPlayback();
  const recordingActions = useRecordingActions();
  const createPolicy = useCreateRecordingPolicy();
  const deletePolicy = useDeleteRecordingPolicy();

  const rows = (recordingsQuery.data ?? []) as RecordingRow[];
  const policies = (policiesQuery.data ?? []) as PolicyRow[];
  const reports = reportsQuery.data as Record<string, unknown> | undefined;

  const recordingColumns: Column<RecordingRow>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', cell: (r) => <span className="font-mono text-xs">{String(r.publicId ?? r.id)}</span> },
      { key: 'caller', header: 'Caller', cell: (r) => String(r.callerNumber ?? '—') },
      { key: 'callee', header: 'Callee', cell: (r) => String(r.calleeNumber ?? '—') },
      { key: 'duration', header: 'Duration', cell: (r) => `${String(r.durationSeconds ?? 0)}s` },
      { key: 'category', header: 'Category', cell: (r) => String(r.category ?? '—') },
      { key: 'created', header: 'Created', cell: (r) => (r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : '—') },
      {
        key: 'flags',
        header: 'Flags',
        cell: (r) => (
          <div className="flex gap-1">
            {r.bookmarked ? <Bookmark className="h-4 w-4 text-primary" /> : null}
            {r.legalHold ? <Shield className="h-4 w-4 text-amber-500" /> : null}
          </div>
        ),
      },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'COMPLETED') === 'COMPLETED' ? 'active' : 'pending'} /> },
    ],
    [],
  );

  const policyColumns: Column<PolicyRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Policy', cell: (r) => <span className="font-medium">{String(r.name ?? 'Default')}</span> },
      { key: 'mode', header: 'Mode', cell: (r) => String(r.policyMode ?? 'ON_DEMAND') },
      {
        key: 'line',
        header: 'Line',
        cell: (r) => String((r.line as { name?: string })?.name ?? 'Tenant-wide'),
      },
      { key: 'retention', header: 'Retention', cell: (r) => (r.retentionDays != null ? `${r.retentionDays}d` : '—') },
      {
        key: 'enabled',
        header: 'Enabled',
        cell: (r) => <StatusBadge status={r.recordingEnabled ? 'active' : 'offline'} />,
      },
      {
        key: 'actions',
        header: '',
        cell: (r) =>
          canManagePolicies ? (
            <Button variant="ghost" size="sm" onClick={() => void deletePolicy.mutateAsync(r.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          ) : null,
      },
    ],
    [canManagePolicies, deletePolicy],
  );

  const handleCreatePolicy = async () => {
    setError(null);
    try {
      await createPolicy.mutateAsync({
        name: policyForm.name,
        policyMode: policyForm.policyMode,
        lineId: policyForm.lineId || undefined,
        retentionDays: Number(policyForm.retentionDays) || undefined,
        archiveAfterDays: Number(policyForm.archiveAfterDays) || undefined,
        recordingEnabled: policyForm.recordingEnabled,
        recordInbound: policyForm.recordInbound,
        recordOutbound: policyForm.recordOutbound,
        legalHoldDefault: policyForm.legalHoldDefault,
      });
      setPolicyOpen(false);
      setPolicyForm(emptyPolicyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <ModuleAccessGate moduleId="call-recordings">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title={module.label}
            description={module.description}
            actions={
              tab === 'policies' && canManagePolicies ? (
                <WriteCreateButton
                  writePermission={PERMISSIONS.TENANT_RECORDING_POLICIES_WRITE}
                  label="Add Policy"
                  onClick={() => { setPolicyOpen(true); setPolicyForm(emptyPolicyForm); setError(null); }}
                />
              ) : undefined
            }
          />

          <div className="mb-6 flex gap-2">
            <Button variant={tab === 'recordings' ? 'default' : 'outline'} size="sm" onClick={() => setTab('recordings')}>
              Recordings
            </Button>
            <Button variant={tab === 'policies' ? 'default' : 'outline'} size="sm" onClick={() => setTab('policies')}>
              Policies
            </Button>
          </div>

          {tab === 'recordings' ? (
            <>
              <QueryState
                isLoading={reportsQuery.isLoading}
                isError={reportsQuery.isError}
                error={reportsQuery.error}
                skeleton={<Skeleton className="mb-6 h-24 w-full max-w-3xl rounded-2xl" />}
              >
                <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="Recordings (30d)" value={Number(reports?.countLast30Days ?? rows.length)} icon={Mic} />
                  <MetricCard label="Storage (GB)" value={Number(reports?.storageGb ?? 0)} icon={Download} />
                  <MetricCard label="Legal Hold" value={Number(reports?.legalHoldCount ?? 0)} icon={Shield} />
                  <MetricCard label="Downloads (30d)" value={Number(reports?.downloadsLast30Days ?? 0)} icon={Download} />
                </div>
              </QueryState>

              <div className="mb-4 flex flex-wrap gap-3">
                <Input
                  placeholder="Search by caller, callee, ID, notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-md"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={bookmarkedOnly} onChange={(e) => setBookmarkedOnly(e.target.checked)} />
                  Bookmarked
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={legalHoldOnly} onChange={(e) => setLegalHoldOnly(e.target.checked)} />
                  Legal hold
                </label>
                {canWrite && selectedIds.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void recordingActions.mutateAsync({ type: 'bulkDelete', ids: selectedIds })}
                  >
                    Delete selected ({selectedIds.length})
                  </Button>
                ) : null}
              </div>

              <QueryState
                isLoading={recordingsQuery.isLoading}
                isError={recordingsQuery.isError}
                error={recordingsQuery.error}
                onRetry={() => void recordingsQuery.refetch()}
                skeleton={<Skeleton className="h-64 rounded-2xl" />}
              >
                {rows.length === 0 ? (
                  <EmptyState title="No recordings" description="Call recordings appear when recording policies are enabled." icon={Mic} />
                ) : (
                  <DataTable
                    columns={recordingColumns}
                    data={rows}
                    pageSize={15}
                    selectable={canWrite}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    rowActions={(row) => [
                      {
                        id: 'play',
                        label: 'Play',
                        icon: <Play className="h-3.5 w-3.5" />,
                        onSelect: () => {
                          void playback.mutateAsync(row.id).then((res) => {
                            if (res.url) window.open(res.url, '_blank', 'noopener,noreferrer');
                          });
                        },
                      },
                      ...(canWrite
                        ? [
                            {
                              id: 'bookmark',
                              label: 'Bookmark',
                              icon: <Bookmark className="h-3.5 w-3.5" />,
                              onSelect: () =>
                                void recordingActions.mutateAsync({
                                  type: 'update',
                                  id: row.id,
                                  payload: { bookmarked: !row.bookmarked },
                                }),
                            },
                            {
                              id: 'legal',
                              label: 'Legal hold',
                              icon: <Shield className="h-3.5 w-3.5" />,
                              onSelect: () =>
                                void recordingActions.mutateAsync({
                                  type: 'update',
                                  id: row.id,
                                  payload: { legalHold: !row.legalHold },
                                }),
                            },
                            {
                              id: 'flag',
                              label: 'Add note',
                              icon: <Flag className="h-3.5 w-3.5" />,
                              onSelect: () =>
                                void recordingActions.mutateAsync({
                                  type: 'annotate',
                                  id: row.id,
                                  payload: { type: 'NOTE', body: 'Review flagged' },
                                }),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </QueryState>

              <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waveform</p>
                <div className="mt-2 flex h-12 items-end gap-0.5">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i} className="w-1 rounded-sm bg-primary/30" style={{ height: `${15 + (i % 9) * 7}%` }} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Use Play to open signed playback URL. Transcription schema is available via API.</p>
              </div>
            </>
          ) : (
            <QueryState
              isLoading={policiesQuery.isLoading}
              isError={policiesQuery.isError}
              error={policiesQuery.error}
              skeleton={<Skeleton className="h-64 rounded-2xl" />}
            >
              {policies.length === 0 ? (
                <EmptyState title="No recording policies" description="Configure always-on, on-demand, or scoped recording policies." icon={Shield} />
              ) : (
                <DataTable columns={policyColumns} data={policies} pageSize={10} />
              )}
            </QueryState>
          )}

          <SlideOver open={policyOpen} onClose={() => setPolicyOpen(false)} title="Create Recording Policy">
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input className="mt-1" value={policyForm.name} onChange={(e) => setPolicyForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Policy Mode</span>
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={policyForm.policyMode}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, policyMode: e.target.value }))}
                >
                  {POLICY_MODES.map((m) => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Line ID (optional)</span>
                <Input className="mt-1" value={policyForm.lineId} onChange={(e) => setPolicyForm((f) => ({ ...f, lineId: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground">Retention (days)</span>
                  <Input className="mt-1" value={policyForm.retentionDays} onChange={(e) => setPolicyForm((f) => ({ ...f, retentionDays: e.target.value }))} />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Archive after (days)</span>
                  <Input className="mt-1" value={policyForm.archiveAfterDays} onChange={(e) => setPolicyForm((f) => ({ ...f, archiveAfterDays: e.target.value }))} />
                </label>
              </div>
              {(['recordingEnabled', 'recordInbound', 'recordOutbound', 'legalHoldDefault'] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={policyForm[key]} onChange={(e) => setPolicyForm((f) => ({ ...f, [key]: e.target.checked }))} />
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                </label>
              ))}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPolicyOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleCreatePolicy()} disabled={createPolicy.isPending}>Create</Button>
            </div>
          </SlideOver>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
