'use client';

import {
  Mic,
  MicOff,
  Pencil,
  Radio,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import {
  useConferenceLive,
  useConferenceParticipantActions,
  useConferenceReports,
  useConferences,
  useCreateConference,
  useDeleteConference,
  useUpdateConference,
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

type ConferenceRow = Record<string, unknown> & { id: string };

const CONFERENCE_TYPES = ['ROOM', 'PERSONAL', 'SCHEDULED', 'INSTANT'] as const;

type ConferenceForm = {
  name: string;
  code: string;
  description: string;
  conferenceType: string;
  pin: string;
  moderatorPin: string;
  maxParticipants: string;
  recordingEnabled: boolean;
  lobbyEnabled: boolean;
  waitingRoomEnabled: boolean;
  lockRoom: boolean;
  muteOnJoin: boolean;
};

const emptyForm: ConferenceForm = {
  name: '',
  code: '',
  description: '',
  conferenceType: 'ROOM',
  pin: '',
  moderatorPin: '',
  maxParticipants: '50',
  recordingEnabled: false,
  lobbyEnabled: false,
  waitingRoomEnabled: false,
  lockRoom: false,
  muteOnJoin: false,
};

export function ConferencesContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_CONFERENCES_WRITE);

  const [search, setSearch] = useState('');
  const [liveId, setLiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<ConferenceRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useConferences(search || undefined);
  const reportsQuery = useConferenceReports();
  const liveQuery = useConferenceLive(liveId ?? undefined);
  const create = useCreateConference();
  const update = useUpdateConference();
  const remove = useDeleteConference();
  const participantActions = useConferenceParticipantActions();

  const rows = (listQuery.data ?? []) as ConferenceRow[];
  const reports = reportsQuery.data as Record<string, unknown> | undefined;
  const live = liveQuery.data as Record<string, unknown> | undefined;
  const liveParticipants = (live?.participants as Record<string, unknown>[] | undefined) ?? [];

  const columns: Column<ConferenceRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Conference', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
      { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '—')}</span> },
      { key: 'type', header: 'Type', cell: (r) => String(r.conferenceType ?? 'ROOM') },
      { key: 'participants', header: 'Participants', cell: (r) => String((r.participants as unknown[])?.length ?? 0) },
      { key: 'max', header: 'Max', cell: (r) => String(r.maxParticipants ?? '—') },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'offline'} /> },
      {
        key: 'actions',
        header: '',
        cell: (r) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLiveId(r.id)}><Radio className="h-4 w-4" /></Button>
            {canWrite ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => void remove.mutateAsync(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canWrite, remove],
  );

  const openEdit = (row: ConferenceRow) => {
    setForm({
      name: String(row.name ?? ''),
      code: String(row.code ?? ''),
      description: String(row.description ?? ''),
      conferenceType: String(row.conferenceType ?? 'ROOM'),
      pin: '',
      moderatorPin: '',
      maxParticipants: String(row.maxParticipants ?? '50'),
      recordingEnabled: Boolean(row.recordingEnabled),
      lobbyEnabled: Boolean(row.lobbyEnabled),
      waitingRoomEnabled: Boolean(row.waitingRoomEnabled),
      lockRoom: Boolean(row.lockRoom),
      muteOnJoin: Boolean(row.muteOnJoin),
    });
    setEditRow(row);
    setError(null);
  };

  const formPayload = () => ({
    name: form.name,
    code: form.code,
    description: form.description || undefined,
    conferenceType: form.conferenceType,
    pin: form.pin || undefined,
    moderatorPin: form.moderatorPin || undefined,
    maxParticipants: Number(form.maxParticipants) || undefined,
    recordingEnabled: form.recordingEnabled,
    lobbyEnabled: form.lobbyEnabled,
    waitingRoomEnabled: form.waitingRoomEnabled,
    lockRoom: form.lockRoom,
    muteOnJoin: form.muteOnJoin,
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

  const formFields = (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Code</span>
        <Input className="mt-1" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Description</span>
        <Input className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Type</span>
        <select
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={form.conferenceType}
          onChange={(e) => setForm((f) => ({ ...f, conferenceType: e.target.value }))}
        >
          {CONFERENCE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">PIN</span>
          <Input className="mt-1" type="password" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))} />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Moderator PIN</span>
          <Input className="mt-1" type="password" value={form.moderatorPin} onChange={(e) => setForm((f) => ({ ...f, moderatorPin: e.target.value }))} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-muted-foreground">Max Participants</span>
        <Input className="mt-1" value={form.maxParticipants} onChange={(e) => setForm((f) => ({ ...f, maxParticipants: e.target.value }))} />
      </label>
      {(['recordingEnabled', 'lobbyEnabled', 'waitingRoomEnabled', 'lockRoom', 'muteOnJoin'] as const).map((key) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))} />
          {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
        </label>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );

  return (
    <ModuleAccessGate moduleId="conferences">
      {({ module }) => (
        <PageContainer>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? 'animate-spin' : ''}`} />
                </Button>
                {canWrite ? (
                  <WriteCreateButton
                    writePermission={PERMISSIONS.TENANT_CONFERENCES_WRITE}
                    label="Add Conference"
                    onClick={() => { setCreateOpen(true); setForm(emptyForm); setError(null); }}
                  />
                ) : null}
              </div>
            }
          />

          <QueryState
            isLoading={reportsQuery.isLoading}
            isError={reportsQuery.isError}
            error={reportsQuery.error}
            skeleton={<Skeleton className="mb-6 h-24 w-full max-w-3xl rounded-2xl" />}
          >
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Conference Rooms" value={Number(reports?.roomCount ?? rows.length)} icon={Radio} />
              <MetricCard label="Active Now" value={Number(reports?.activeCount ?? 0)} icon={Users} />
              <MetricCard label="Participants (30d)" value={Number(reports?.participantsLast30Days ?? 0)} icon={Users} />
              <MetricCard label="Recorded Sessions" value={Number(reports?.recordedSessions ?? 0)} icon={Mic} />
            </div>
          </QueryState>

          <div className="mb-4">
            <Input placeholder="Search conferences…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          </div>

            <QueryState
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            error={listQuery.error}
            onRetry={() => void listQuery.refetch()}
            skeleton={<Skeleton className="h-64 rounded-2xl" />}
          >
            {rows.length === 0 ? (
              <EmptyState title="No conference rooms" description="Create conference bridges for team meetings and scheduled events." icon={Radio} />
            ) : (
              <DataTable columns={columns} data={rows} pageSize={10} />
            )}
          </QueryState>

          {liveId ? (
            <div className="mt-8 space-y-4 rounded-2xl border border-border p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Live Conference</h3>
                  <p className="text-sm text-muted-foreground">
                    Duration: {live?.durationSeconds != null ? `${String(live.durationSeconds)}s` : '—'}
                    {live?.recording ? ' · Recording' : ''}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLiveId(null)}>Close</Button>
              </div>

              <QueryState
                isLoading={liveQuery.isLoading}
                isError={liveQuery.isError}
                error={liveQuery.error}
                skeleton={<Skeleton className="h-32 rounded-xl" />}
              >
                {liveParticipants.length === 0 ? (
                  <EmptyState title="No active participants" description="Participants will appear when a conference session is in progress." icon={Users} />
                ) : (
                  <ul className="space-y-2">
                    {liveParticipants.map((p) => {
                      const pid = String(p.id ?? p.participantId ?? '');
                      const name = String((p.line as { name?: string })?.name ?? p.displayName ?? pid.slice(0, 8));
                      const muted = Boolean(p.muted);
                      const speaking = Boolean(p.speaking);
                      return (
                        <li key={pid} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`h-2 w-2 rounded-full ${speaking ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                            <span className="font-medium">{name}</span>
                            {muted ? <MicOff className="h-4 w-4 text-muted-foreground" /> : <Mic className="h-4 w-4 text-success" />}
                          </div>
                          {canWrite ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void participantActions.mutateAsync({
                                    type: 'update',
                                    conferenceId: liveId,
                                    participantId: pid,
                                    payload: { muted: !muted },
                                  })
                                }
                              >
                                {muted ? 'Unmute' : 'Mute'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void participantActions.mutateAsync({
                                    type: 'remove',
                                    conferenceId: liveId,
                                    participantId: pid,
                                  })
                                }
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                </div>
              ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
            </QueryState>
            </div>
          ) : null}

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Create Conference">
            {formFields}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleCreate()} disabled={create.isPending}>Create</Button>
            </div>
          </SlideOver>

          <SlideOver open={Boolean(editRow)} onClose={() => setEditRow(null)} title="Edit Conference">
            {formFields}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={() => void handleUpdate()} disabled={update.isPending}>Save</Button>
            </div>
          </SlideOver>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
