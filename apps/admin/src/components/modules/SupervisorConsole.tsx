'use client';

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Clock,
  Headphones,
  Mic,
  Monitor,
  Pause,
  PhoneIncoming,
  PhoneOff,
  Play,
  RefreshCw,
  Share2,
  Users,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useAuth, usePermissions } from '../../lib/auth/AuthProvider';
import {
  useAddCoachingNote,
  useRecordingPlaybackUrl,
  useSupervisorAgentActions,
  useSupervisorAgents,
  useSupervisorCallActions,
  useSupervisorCallTimeline,
  useSupervisorCoaching,
  useSupervisorDashboard,
  useSupervisorEmergencyStop,
  useSupervisorLiveCalls,
  useSupervisorQueueActions,
  useSupervisorQueues,
  useSupervisorRecordingActions,
  useSupervisorRecordings,
  useSupervisorReports,
  useSupervisorWallboard,
} from '../../lib/hooks/queries/use-supervisor';
import { hasPermission, PERMISSIONS } from '../../lib/rbac/permissions';
import type { SupervisorAgent, SupervisorLiveCall, SupervisorQueue } from '../../types/supervisor';
import { DataTable, type Column } from '../data/DataTable';
import type { ActionItem } from '../data/ActionDropdown';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { ModuleAccessGate } from './shared/ModuleShell';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { LiveIndicator } from '../ui/LiveIndicator';
import { Badge, StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils/cn';
import { formatExtensionLabel } from '../../lib/extensions/format-extension-label';

type TabId = 'dashboard' | 'wallboard' | 'agents' | 'queues' | 'calls' | 'recordings' | 'reports' | 'coaching';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'wallboard', label: 'Wallboard' },
  { id: 'agents', label: 'Agents' },
  { id: 'queues', label: 'Queues' },
  { id: 'calls', label: 'Live Calls' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'reports', label: 'Reports' },
  { id: 'coaching', label: 'Coaching' },
];

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function presenceBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes('available') || s === 'online') return 'online' as const;
  if (s.includes('busy') || s.includes('call') || s.includes('paused')) return 'warning' as const;
  return 'offline' as const;
}

function DashboardTab({ tenantId }: { tenantId?: string }) {
  const query = useSupervisorDashboard(tenantId);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      skeleton={
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      }
    >
      {query.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Active Calls" value={query.data.activeCalls} icon={PhoneIncoming} />
            <MetricCard label="Waiting Calls" value={query.data.waitingCalls} icon={Clock} />
            <MetricCard label="Longest Waiting" value={formatDuration(query.data.longestWaitingSec)} icon={Clock} />
            <MetricCard label="Answered Today" value={query.data.answeredToday} icon={PhoneIncoming} />
            <MetricCard label="Abandoned" value={query.data.abandoned} icon={AlertTriangle} />
            <MetricCard label="SLA %" value={`${query.data.slaPct}%`} icon={Monitor} />
            <MetricCard label="Available Agents" value={query.data.availableAgents} icon={Users} />
            <MetricCard label="Busy Agents" value={query.data.busyAgents} icon={Users} />
            <MetricCard label="Offline Agents" value={query.data.offlineAgents} icon={Users} />
            <MetricCard label="Paused Agents" value={query.data.pausedAgents} icon={Pause} />
            <MetricCard label="Avg Handle Time" value={formatDuration(query.data.averageHandleTimeSec)} icon={Clock} />
            <MetricCard label="Avg Wait Time" value={formatDuration(query.data.averageWaitTimeSec)} icon={Clock} />
            <MetricCard label="Service Level" value={`${query.data.serviceLevel}%`} icon={Monitor} />
            <MetricCard label="Queue Occupancy" value={`${query.data.queueOccupancyPct}%`} icon={Users} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Updated {new Date(query.data.ts).toLocaleString()}</p>
        </>
      ) : null}
    </QueryState>
  );
}

function WallboardTab({ tenantId }: { tenantId?: string }) {
  const query = useSupervisorWallboard(tenantId);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      skeleton={<Skeleton className="h-96 w-full rounded-2xl" />}
    >
      {query.data ? (
        <div className="space-y-6 rounded-2xl bg-zinc-950 p-6 text-zinc-50">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Active Calls</p>
              <p className="text-4xl font-bold tabular-nums">{query.data.activeCalls}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Waiting</p>
              <p className="text-4xl font-bold tabular-nums">{query.data.waitingCalls}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">SLA</p>
              <p className="text-4xl font-bold tabular-nums">{query.data.slaPct}%</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Agents Available</p>
              <p className="text-4xl font-bold tabular-nums">{query.data.availableAgents}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.queues.map((q) => (
              <div
                key={q.id}
                className={cn(
                  'rounded-2xl border p-5',
                  q.emergencyClosed ? 'border-red-500/50 bg-red-950/30' : 'border-zinc-800 bg-zinc-900',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{q.name}</h3>
                  {q.paused ? <Badge variant="warning">Paused</Badge> : null}
                  {q.emergencyClosed ? <Badge variant="destructive">Closed</Badge> : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-zinc-400">Waiting</p>
                    <p className="text-3xl font-bold tabular-nums">{q.waiting}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">Agents</p>
                    <p className="text-3xl font-bold tabular-nums">{q.agents}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </QueryState>
  );
}

function AgentsTab({
  tenantId,
  canSupervise,
}: {
  tenantId?: string;
  canSupervise: boolean;
}) {
  const query = useSupervisorAgents(tenantId);
  const agentActions = useSupervisorAgentActions();

  const columns: Column<SupervisorAgent & { id: string }>[] = [
    { key: 'agent', header: 'Agent', cell: (r) => r.agentName },
    { key: 'ext', header: 'Extension', cell: (r) => (r.extension ? formatExtensionLabel(r.extension, r.agentName) : '—') },
    { key: 'queue', header: 'Queue', cell: (r) => r.queueName },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={presenceBadge(r.status)} /> },
    { key: 'presence', header: 'Presence', cell: (r) => r.presence },
    { key: 'call', header: 'Current Call', cell: (r) => r.currentCallPlatformUuid?.slice(0, 8) ?? '—' },
    { key: 'dur', header: 'Duration', cell: (r) => (r.callDurationSec ? formatDuration(r.callDurationSec) : '—') },
    { key: 'caller', header: 'Caller', cell: (r) => r.callerNumber ?? '—' },
    { key: 'device', header: 'Device', cell: (r) => r.device ?? '—' },
    { key: 'net', header: 'Network', cell: (r) => r.networkQuality },
    { key: 'pause', header: 'Pause Reason', cell: (r) => r.pauseReason ?? '—' },
  ];

  const rows = useMemo(
    () => (query.data ?? []).map((a) => ({ ...a, id: a.lineId })),
    [query.data],
  );

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={!query.isLoading && rows.length === 0}
      skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
    >
      <DataTable
        columns={columns}
        data={rows}
        pageSize={20}
        rowActions={
          canSupervise
            ? (row) => [
                {
                  id: 'pause',
                  label: 'Pause Agent',
                  icon: <Pause className="h-3.5 w-3.5" />,
                  onSelect: () => void agentActions.mutateAsync({ action: 'pause', lineId: row.lineId, reason: 'Supervisor pause' }),
                },
                {
                  id: 'resume',
                  label: 'Resume Agent',
                  onSelect: () => void agentActions.mutateAsync({ action: 'resume', lineId: row.lineId }),
                },
                {
                  id: 'logout',
                  label: 'Force Logout',
                  destructive: true,
                  onSelect: () => void agentActions.mutateAsync({ action: 'logout', lineId: row.lineId }),
                },
              ]
            : undefined
        }
      />
    </QueryState>
  );
}

function QueuesTab({ tenantId, canSupervise }: { tenantId?: string; canSupervise: boolean }) {
  const query = useSupervisorQueues(tenantId);
  const queueActions = useSupervisorQueueActions();

  const columns: Column<SupervisorQueue>[] = [
    { key: 'name', header: 'Queue', cell: (r) => r.name },
    { key: 'waiting', header: 'Waiting', cell: (r) => r.waitingCalls },
    { key: 'agents', header: 'Agents', cell: (r) => r.agentsLoggedIn },
    { key: 'avg', header: 'Avg Wait', cell: (r) => formatDuration(r.averageWaitSec) },
    { key: 'long', header: 'Longest', cell: (r) => formatDuration(r.longestWaitSec) },
    { key: 'abn', header: 'Abandon %', cell: (r) => `${r.abandonPct}%` },
    { key: 'sla', header: 'SLA', cell: (r) => `${r.serviceLevelPct}%` },
    { key: 'state', header: 'State', cell: (r) => (r.emergencyClosed ? 'Emergency Closed' : r.paused ? 'Paused' : 'Active') },
  ];

  const rows = useMemo(() => (query.data ?? []).map((q) => ({ ...q, id: q.id })), [query.data]);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
    >
      <DataTable
        columns={columns}
        data={rows}
        pageSize={15}
        rowActions={
          canSupervise
            ? (row) => [
                { id: 'pause', label: 'Pause Queue', onSelect: () => void queueActions.mutateAsync({ action: 'pause', queueId: row.id }) },
                { id: 'resume', label: 'Resume Queue', onSelect: () => void queueActions.mutateAsync({ action: 'resume', queueId: row.id }) },
                {
                  id: 'emergency',
                  label: 'Emergency Close',
                  destructive: true,
                  onSelect: () => void queueActions.mutateAsync({ action: 'emergency', queueId: row.id }),
                },
              ]
            : undefined
        }
      />
    </QueryState>
  );
}

function LiveCallsTab({
  tenantId,
  canSupervise,
  onSelectCall,
}: {
  tenantId?: string;
  canSupervise: boolean;
  onSelectCall: (platformUuid: string) => void;
}) {
  const query = useSupervisorLiveCalls(tenantId);
  const callActions = useSupervisorCallActions();

  const columns: Column<SupervisorLiveCall>[] = [
    { key: 'id', header: 'Call ID', cell: (r) => <span className="font-mono text-xs">{r.platformUuid}</span> },
    { key: 'caller', header: 'Caller', cell: (r) => r.caller },
    { key: 'callee', header: 'Callee', cell: (r) => r.callee },
    { key: 'queue', header: 'Queue', cell: (r) => r.queueName ?? '—' },
    { key: 'agent', header: 'Agent', cell: (r) => r.agentName ?? '—' },
    { key: 'dur', header: 'Duration', cell: (r) => formatDuration(r.durationSec) },
    { key: 'codec', header: 'Codec', cell: (r) => r.codec },
    { key: 'mos', header: 'MOS', cell: (r) => (r.mos != null ? r.mos.toFixed(2) : '—') },
    { key: 'loss', header: 'Pkt Loss', cell: (r) => (r.packetLossPct != null ? `${r.packetLossPct}%` : '—') },
    { key: 'jitter', header: 'Jitter', cell: (r) => (r.jitterMs != null ? `${r.jitterMs}ms` : '—') },
    { key: 'rtp', header: 'RTP', cell: (r) => r.rtpQuality },
    { key: 'rec', header: 'Recording', cell: (r) => (r.recording ? 'On' : '—') },
    { key: 'xfer', header: 'Transfer', cell: (r) => r.transferStatus },
  ];

  const rows = useMemo(
    () => (query.data ?? []).map((c) => ({ ...c, id: c.platformUuid || c.id })),
    [query.data],
  );

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
      skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
    >
      <DataTable
        columns={columns}
        data={rows}
        pageSize={20}
        rowActions={(row) => {
          const items: ActionItem[] = [
            { id: 'timeline', label: 'View Timeline', onSelect: () => onSelectCall(row.platformUuid) },
          ];
          if (canSupervise) {
            items.push(
              { id: 'listen', label: 'Listen', icon: <Headphones className="h-3.5 w-3.5" />, onSelect: () => void callActions.mutateAsync({ action: 'listen', platformUuid: row.platformUuid }) },
              { id: 'whisper', label: 'Whisper', icon: <Mic className="h-3.5 w-3.5" />, onSelect: () => void callActions.mutateAsync({ action: 'whisper', platformUuid: row.platformUuid }) },
              { id: 'barge', label: 'Barge', icon: <Share2 className="h-3.5 w-3.5" />, onSelect: () => void callActions.mutateAsync({ action: 'barge', platformUuid: row.platformUuid }) },
              { id: 'hangup', label: 'Hang Up', destructive: true, icon: <PhoneOff className="h-3.5 w-3.5" />, onSelect: () => void callActions.mutateAsync({ action: 'hangup', platformUuid: row.platformUuid }) },
            );
          }
          return items;
        }}
      />
    </QueryState>
  );
}

function CallTimelinePanel({ platformUuid, tenantId, onClose }: { platformUuid: string; tenantId?: string; onClose: () => void }) {
  const timeline = useSupervisorCallTimeline(platformUuid, tenantId);
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Call Timeline — {platformUuid.slice(0, 12)}…</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <QueryState isLoading={timeline.isLoading} isError={timeline.isError} error={timeline.error} skeleton={<Skeleton className="h-32" />}>
        {timeline.data ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              State: {timeline.data.state} · Recording: {timeline.data.recordingStatus}
            </p>
            <ol className="space-y-2 border-l-2 border-border pl-4">
              {timeline.data.timeline.map((ev, i) => (
                <li key={i} className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{new Date(ev.ts).toLocaleTimeString()}</span>
                  <span className="ml-2 font-medium capitalize">{ev.event}</span>
                  <span className="ml-2 text-muted-foreground">{ev.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}

function RecordingsTab() {
  const [search, setSearch] = useState('');
  const query = useSupervisorRecordings({ search: search || undefined, limit: 100 });
  const playback = useRecordingPlaybackUrl();
  const annotate = useSupervisorRecordingActions();

  const columns: Column<{ id: string; publicId: string; platformUuid: string | null; durationSeconds: number | null; createdAt: string; status: string }>[] = [
    { key: 'id', header: 'ID', cell: (r) => <span className="font-mono text-xs">{r.publicId}</span> },
    { key: 'call', header: 'Call', cell: (r) => r.platformUuid?.slice(0, 12) ?? '—' },
    { key: 'dur', header: 'Duration', cell: (r) => `${r.durationSeconds ?? 0}s` },
    { key: 'created', header: 'Created', cell: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'available' ? 'online' : 'pending'} /> },
  ];

  const rows = useMemo(() => (query.data ?? []).map((r) => ({ ...r, id: r.id })), [query.data]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Search recordings…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-xl border border-border bg-background px-4 py-2 text-sm"
      />
      <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
        <DataTable
          columns={columns}
          data={rows}
          pageSize={15}
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
            {
              id: 'flag',
              label: 'Flag',
              onSelect: () => void annotate.mutateAsync({ id: row.id, type: 'FLAG', body: 'Supervisor flag' }),
            },
            {
              id: 'bookmark',
              label: 'Bookmark',
              onSelect: () => void annotate.mutateAsync({ id: row.id, type: 'BOOKMARK' }),
            },
          ]}
        />
      </QueryState>
    </div>
  );
}

function ReportsTab({ tenantId }: { tenantId?: string }) {
  const query = useSupervisorReports(tenantId);
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      {query.data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="SLA %" value={`${query.data.summary.slaPct}%`} />
            <MetricCard label="Avg Handle Time" value={formatDuration(query.data.summary.avgHandleTimeSec)} />
            <MetricCard label="Abandon Rate" value={`${query.data.summary.abandonRatePct}%`} />
            <MetricCard label="FCR" value={`${query.data.summary.firstCallResolutionPct}%`} />
            <MetricCard label="Missed Calls" value={query.data.summary.missedCalls} />
            <MetricCard label="Transfers" value={query.data.summary.transfers} />
          </div>
          <h3 className="text-lg font-semibold">Agent Performance</h3>
          <DataTable
            columns={[
              { key: 'name', header: 'Agent', cell: (r) => r.agentName },
              { key: 'handled', header: 'Handled', cell: (r) => r.callsHandled },
              { key: 'aht', header: 'AHT', cell: (r) => formatDuration(r.avgHandleTimeSec) },
              { key: 'missed', header: 'Missed', cell: (r) => r.missedCalls },
            ]}
            data={query.data.agentPerformance.map((a) => ({ ...a, id: a.lineId }))}
            pageSize={10}
          />
          <h3 className="text-lg font-semibold">Queue Performance</h3>
          <DataTable
            columns={[
              { key: 'name', header: 'Queue', cell: (r) => r.queueName },
              { key: 'offered', header: 'Offered', cell: (r) => r.offered },
              { key: 'answered', header: 'Answered', cell: (r) => r.answered },
              { key: 'abn', header: 'Abandon %', cell: (r) => `${r.abandonRatePct}%` },
              { key: 'sla', header: 'SLA', cell: (r) => `${r.slaPct}%` },
            ]}
            data={query.data.queuePerformance.map((q) => ({ ...q, id: q.queueId }))}
            pageSize={10}
          />
        </div>
      ) : null}
    </QueryState>
  );
}

function CoachingTab() {
  const query = useSupervisorCoaching();
  const addNote = useAddCoachingNote();
  const [callSessionId, setCallSessionId] = useState('');
  const [notes, setNotes] = useState('');
  const [qualityScore, setQualityScore] = useState(80);
  const [agentScore, setAgentScore] = useState(80);

  const submit = useCallback(() => {
    if (!callSessionId.trim()) return;
    void addNote.mutateAsync({
      callSessionId: callSessionId.trim(),
      qualityScore,
      agentScore,
      notes: notes.trim() || undefined,
    });
    setNotes('');
  }, [addNote, agentScore, callSessionId, notes, qualityScore]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Post-Call Coaching Note</h3>
        <input
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="Call session ID"
          value={callSessionId}
          onChange={(e) => setCallSessionId(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
          placeholder="Supervisor comments…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-4">
          <label className="text-sm">
            Quality Score
            <input type="number" min={0} max={100} value={qualityScore} onChange={(e) => setQualityScore(Number(e.target.value))} className="ml-2 w-16 rounded border px-2 py-1" />
          </label>
          <label className="text-sm">
            Agent Score
            <input type="number" min={0} max={100} value={agentScore} onChange={(e) => setAgentScore(Number(e.target.value))} className="ml-2 w-16 rounded border px-2 py-1" />
          </label>
        </div>
        <Button onClick={submit} disabled={addNote.isPending}>
          Save Coaching Note
        </Button>
      </div>
      <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-48" />}>
        <DataTable
          columns={[
            { key: 'call', header: 'Call Session', cell: (r) => <span className="font-mono text-xs">{r.callSessionId.slice(0, 8)}…</span> },
            { key: 'q', header: 'Quality', cell: (r) => r.qualityScore ?? '—' },
            { key: 'a', header: 'Agent', cell: (r) => r.agentScore ?? '—' },
            { key: 'notes', header: 'Notes', cell: (r) => r.notes ?? '—' },
            { key: 'when', header: 'When', cell: (r) => new Date(r.createdAt).toLocaleString() },
          ]}
          data={(query.data ?? []).map((n) => ({ ...n, id: n.id }))}
          pageSize={10}
        />
      </QueryState>
    </div>
  );
}

export function SupervisorConsole() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const { session } = useAuth();
  const permissions = usePermissions();
  const tenantId = session?.tenantId;
  const canSupervise = hasPermission(permissions, [
    PERMISSIONS.SUPERVISOR_CALLS_SUPERVISE,
    PERMISSIONS.SUPERVISOR_AGENTS_WRITE,
    PERMISSIONS.SUPERVISOR_QUEUES_WRITE,
    PERMISSIONS.OPS_LIVE_CALLS_SUPERVISE,
  ]);
  const emergencyStop = useSupervisorEmergencyStop();
  const dashboard = useSupervisorDashboard(tenantId);

  return (
    <ModuleAccessGate moduleId="supervisor">
      {({ module }) => (
        <PageContainer className={tab === 'wallboard' ? 'max-w-[100vw]' : undefined}>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <LiveIndicator label="Live · 5s refresh" status={dashboard.isError ? 'degraded' : 'online'} />
                  <Button variant="outline" size="sm" onClick={() => void dashboard.refetch()}>
                    <RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  {canSupervise ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Emergency stop will pause all queues. Continue?')) {
                          void emergencyStop.mutateAsync();
                        }
                      }}
                      disabled={emergencyStop.isPending}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Emergency Stop
                    </Button>
                  ) : null}
                </div>
              }
            />

            <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-2">
              {TABS.map((t) => (
                <Button
                  key={t.id}
                  variant={tab === t.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            {tab === 'dashboard' ? <DashboardTab tenantId={tenantId} /> : null}
            {tab === 'wallboard' ? <WallboardTab tenantId={tenantId} /> : null}
            {tab === 'agents' ? <AgentsTab tenantId={tenantId} canSupervise={canSupervise} /> : null}
            {tab === 'queues' ? <QueuesTab tenantId={tenantId} canSupervise={canSupervise} /> : null}
            {tab === 'calls' ? (
              <>
                <LiveCallsTab tenantId={tenantId} canSupervise={canSupervise} onSelectCall={setSelectedCall} />
                {selectedCall ? (
                  <CallTimelinePanel platformUuid={selectedCall} tenantId={tenantId} onClose={() => setSelectedCall(null)} />
                ) : null}
              </>
            ) : null}
            {tab === 'recordings' ? <RecordingsTab /> : null}
            {tab === 'reports' ? <ReportsTab tenantId={tenantId} /> : null}
            {tab === 'coaching' ? <CoachingTab /> : null}
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
