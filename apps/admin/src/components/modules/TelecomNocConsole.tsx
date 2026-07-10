'use client';

import { motion } from 'framer-motion';
import { Activity, AlertTriangle, Network, Phone, Radio, RefreshCw, Search, Server, Shield } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import {
  useCallDiagnostics,
  useNocAlertActions,
  useNocAlerts,
  useNocCarriers,
  useNocDashboard,
  useNocFraudScan,
  useNocKamailio,
  useNocMediaSessions,
  useNocRegistrationActions,
  useNocRtpengine,
  useNocSipDialogs,
  useNocSipRegistrations,
  useNocSipTrace,
  useRunSynthetic,
} from '../../lib/hooks/queries/use-telecom-noc';
import type { NocAlert, NocSipDialog, NocSipRegistration } from '../../types/telecom-noc';
import { DataTable, type Column } from '../data/DataTable';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { ModuleAccessGate } from './shared/ModuleShell';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { LiveIndicator } from '../ui/LiveIndicator';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils/cn';

type Tab =
  | 'dashboard'
  | 'registrations'
  | 'dialogs'
  | 'trace'
  | 'media'
  | 'kamailio'
  | 'rtpengine'
  | 'carriers'
  | 'alerts'
  | 'fraud'
  | 'synthetic'
  | 'diagnostics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'registrations', label: 'SIP Registrations' },
  { id: 'dialogs', label: 'SIP Dialogs' },
  { id: 'trace', label: 'SIP Trace' },
  { id: 'media', label: 'Media' },
  { id: 'kamailio', label: 'Kamailio' },
  { id: 'rtpengine', label: 'RTPengine' },
  { id: 'carriers', label: 'Carriers' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'fraud', label: 'Fraud' },
  { id: 'synthetic', label: 'Synthetic' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

function statusBadge(s: string) {
  if (s === 'up' || s === 'healthy' || s === 'REGISTERED') return 'online' as const;
  if (s === 'degraded' || s === 'warning') return 'warning' as const;
  return 'offline' as const;
}

export function TelecomNocConsole() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [wallboard, setWallboard] = useState(false);
  const { session } = useAuth();
  const tenantId = session?.tenantId;
  const dashboard = useNocDashboard(tenantId);

  return (
    <ModuleAccessGate moduleId="telecom-noc">
      {({ module }) => (
        <PageContainer className={wallboard ? 'max-w-[100vw]' : undefined}>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <LiveIndicator label="Live · 5s" status={dashboard.isError ? 'degraded' : 'online'} />
                  <Button variant="outline" size="sm" onClick={() => setWallboard((w) => !w)}>
                    {wallboard ? 'Exit Wallboard' : 'Wallboard'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void dashboard.refetch()}>
                    <RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              }
            />

            <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
              {TABS.map((t) => (
                <Button key={t.id} variant={tab === t.id ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t.id)}>
                  {t.label}
                </Button>
              ))}
            </div>

            {tab === 'dashboard' ? <DashboardPanel data={dashboard} wallboard={wallboard} /> : null}
            {tab === 'registrations' ? <RegistrationsPanel tenantId={tenantId} /> : null}
            {tab === 'dialogs' ? <DialogsPanel tenantId={tenantId} /> : null}
            {tab === 'trace' ? <TracePanel tenantId={tenantId} /> : null}
            {tab === 'media' ? <MediaPanel tenantId={tenantId} /> : null}
            {tab === 'kamailio' ? <KamailioPanel /> : null}
            {tab === 'rtpengine' ? <RtpenginePanel tenantId={tenantId} /> : null}
            {tab === 'carriers' ? <CarriersPanel /> : null}
            {tab === 'alerts' ? <AlertsPanel /> : null}
            {tab === 'fraud' ? <FraudPanel tenantId={tenantId} /> : null}
            {tab === 'synthetic' ? <SyntheticPanel /> : null}
            {tab === 'diagnostics' ? <DiagnosticsPanel tenantId={tenantId} /> : null}
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}

function DashboardPanel({
  data,
  wallboard,
}: {
  data: ReturnType<typeof useNocDashboard>;
  wallboard: boolean;
}) {
  return (
    <QueryState isLoading={data.isLoading} isError={data.isError} error={data.error} skeleton={<Skeleton className="h-64" />}>
      {data.data ? (
        <div className={cn(wallboard && 'rounded-2xl bg-zinc-950 p-6 text-zinc-50')}>
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status={statusBadge(data.data.platformStatus)} />
            <span className="text-sm text-muted-foreground">Platform {data.data.platformStatus}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Concurrent Calls" value={data.data.concurrentCalls} icon={Phone} />
            <MetricCard label="SIP Phones" value={data.data.registeredSipPhones} icon={Network} />
            <MetricCard label="WebRTC Clients" value={data.data.registeredWebrtcClients} icon={Radio} />
            <MetricCard label="CPU Load (1m)" value={data.data.host.loadAvg1m} icon={Activity} />
            <MetricCard label="Memory Used" value={`${data.data.host.memoryUsedPct}%`} icon={Server} />
            <MetricCard label="Kamailio" value={data.data.kamailioStatus?.status ?? '—'} icon={Network} />
            <MetricCard label="RTPengine" value={data.data.rtpengineStatus?.status ?? '—'} icon={Radio} />
            <MetricCard label="Dispatcher" value={`${data.data.dispatcherStatus.nodesUp}/${data.data.dispatcherStatus.nodesTotal}`} icon={Server} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(data.data.infrastructure ?? {}).map(([name, comp]) => (
              <div key={name} className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="font-medium capitalize">{name}</p>
                <StatusBadge status={statusBadge(comp.status)} />
                {comp.latencyMs != null ? <p className="mt-1 text-xs text-muted-foreground">{comp.latencyMs}ms</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </QueryState>
  );
}

function RegistrationsPanel({ tenantId }: { tenantId?: string }) {
  const query = useNocSipRegistrations({ tenantId });
  const actions = useNocRegistrationActions();
  const cols: Column<NocSipRegistration & { id: string }>[] = [
    { key: 'user', header: 'Username', cell: (r) => <span className="font-mono text-xs">{r.username}</span> },
    { key: 'ext', header: 'Extension', cell: (r) => r.extension ?? '—' },
    { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
    { key: 'ip', header: 'IP', cell: (r) => r.ip ?? '—' },
    { key: 'transport', header: 'Transport', cell: (r) => r.transport },
    { key: 'ua', header: 'User Agent', cell: (r) => <span className="max-w-[160px] truncate">{r.userAgent}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={statusBadge(r.status)} /> },
  ];
  const rows = (query.data ?? []).map((r) => ({ ...r, id: r.id }));
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <DataTable
        columns={cols}
        data={rows}
        pageSize={20}
        rowActions={(row) => [
          { id: 'refresh', label: 'Refresh', onSelect: () => void actions.mutateAsync({ action: 'refresh', id: row.id }) },
          { id: 'rereg', label: 'Force Re-register', onSelect: () => void actions.mutateAsync({ action: 'reregister', id: row.id }) },
          { id: 'unreg', label: 'Unregister', destructive: true, onSelect: () => void actions.mutateAsync({ action: 'unregister', id: row.id }) },
        ]}
      />
    </QueryState>
  );
}

function DialogsPanel({ tenantId }: { tenantId?: string }) {
  const query = useNocSipDialogs(tenantId);
  const cols: Column<NocSipDialog>[] = [
    { key: 'call', header: 'Call ID', cell: (r) => <span className="font-mono text-xs">{r.callId?.slice(0, 16)}</span> },
    { key: 'from', header: 'From', cell: (r) => r.from },
    { key: 'to', header: 'To', cell: (r) => r.to },
    { key: 'state', header: 'State', cell: (r) => r.state },
    { key: 'codec', header: 'Codec', cell: (r) => r.codec },
    { key: 'tenant', header: 'Tenant', cell: (r) => r.tenant },
    { key: 'queue', header: 'Queue', cell: (r) => r.queue ?? '—' },
    { key: 'rec', header: 'Recording', cell: (r) => r.recordingStatus },
  ];
  const rows = (query.data ?? []).map((r) => ({ ...r, id: r.platformUuid }));
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <DataTable columns={cols} data={rows} pageSize={20} />
    </QueryState>
  );
}

function TracePanel({ tenantId }: { tenantId?: string }) {
  const [callId, setCallId] = useState('');
  const [platformUuid, setPlatformUuid] = useState('');
  const query = useNocSipTrace({ tenantId, callId: callId || undefined, platformUuid: platformUuid || undefined }, Boolean(callId || platformUuid));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Call-ID" value={callId} onChange={(e) => setCallId(e.target.value)} />
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Platform UUID" value={platformUuid} onChange={(e) => setPlatformUuid(e.target.value)} />
        <Button size="sm"><Search className="h-4 w-4" /> Search</Button>
      </div>
      <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error}>
        <pre className="max-h-[480px] overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">{JSON.stringify(query.data, null, 2)}</pre>
      </QueryState>
    </div>
  );
}

function MediaPanel({ tenantId }: { tenantId?: string }) {
  const query = useNocMediaSessions(tenantId);
  const rows = (query.data ?? []).map((r, i) => ({ ...r, id: String(r.platformUuid ?? i) }));
  const cols: Column<{ id: string } & Record<string, unknown>>[] = [
    { key: 'call', header: 'Call', cell: (r) => String(r.platformUuid ?? '').slice(0, 12) },
    { key: 'mos', header: 'MOS', cell: (r) => (r.mos != null ? String(r.mos) : '—') },
    { key: 'loss', header: 'Pkt Loss', cell: (r) => (r.packetLossPct != null ? `${r.packetLossPct}%` : '—') },
    { key: 'jitter', header: 'Jitter', cell: (r) => (r.jitterMs != null ? `${r.jitterMs}ms` : '—') },
    { key: 'codec', header: 'Codec', cell: (r) => String(r.codec ?? '—') },
    { key: 'srtp', header: 'SRTP', cell: (r) => (r.srtp ? 'Yes' : 'No') },
    { key: 'rtp', header: 'Quality', cell: (r) => String(r.rtpQuality ?? '—') },
  ];
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <DataTable columns={cols} data={rows} pageSize={20} />
    </QueryState>
  );
}

function KamailioPanel() {
  const query = useNocKamailio();
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <pre className="max-h-[520px] overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">{JSON.stringify(query.data, null, 2)}</pre>
    </QueryState>
  );
}

function RtpenginePanel({ tenantId }: { tenantId?: string }) {
  const query = useNocRtpengine(tenantId);
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <pre className="max-h-[520px] overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">{JSON.stringify(query.data, null, 2)}</pre>
    </QueryState>
  );
}

function CarriersPanel() {
  const query = useNocCarriers();
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <pre className="max-h-[520px] overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">{JSON.stringify(query.data, null, 2)}</pre>
    </QueryState>
  );
}

function AlertsPanel() {
  const query = useNocAlerts();
  const actions = useNocAlertActions();
  const cols: Column<NocAlert>[] = [
    { key: 'sev', header: 'Severity', cell: (r) => r.severity },
    { key: 'title', header: 'Title', cell: (r) => r.title },
    { key: 'source', header: 'Source', cell: (r) => r.source },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'OPEN' ? 'warning' : 'online'} /> },
    { key: 'when', header: 'Created', cell: (r) => new Date(r.createdAt).toLocaleString() },
  ];
  const rows = (query.data ?? []).map((r) => ({ ...r, id: r.id }));
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      <DataTable
        columns={cols}
        data={rows}
        pageSize={15}
        rowActions={(row) => [
          { id: 'ack', label: 'Acknowledge', onSelect: () => void actions.mutateAsync({ action: 'ack', id: row.id }) },
          { id: 'resolve', label: 'Resolve', onSelect: () => void actions.mutateAsync({ action: 'resolve', id: row.id }) },
        ]}
      />
    </QueryState>
  );
}

function FraudPanel({ tenantId }: { tenantId?: string }) {
  const query = useNocFraudScan(tenantId);
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-48" />}>
      {query.data ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Scanned {new Date(query.data.scannedAt).toLocaleString()}</p>
          {query.data.signals.length === 0 ? (
            <p className="text-sm">No fraud signals detected.</p>
          ) : (
            query.data.signals.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-medium">{s.title}</span>
                  <span className="text-xs uppercase text-muted-foreground">{s.severity}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </QueryState>
  );
}

function SyntheticPanel() {
  const run = useRunSynthetic();
  return (
    <div className="space-y-4">
      <Button onClick={() => void run.mutateAsync()} disabled={run.isPending}>
        <Shield className="h-4 w-4" /> Run Synthetic Health Checks
      </Button>
      {run.data ? (
        <pre className="max-h-[480px] overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">{JSON.stringify(run.data, null, 2)}</pre>
      ) : null}
    </div>
  );
}

function DiagnosticsPanel({ tenantId }: { tenantId?: string }) {
  const [platformUuid, setPlatformUuid] = useState('');
  const query = useCallDiagnostics(platformUuid || null, tenantId);
  return (
    <div className="space-y-4">
      <input
        className="w-full max-w-lg rounded-xl border px-3 py-2 text-sm font-mono"
        placeholder="Platform UUID"
        value={platformUuid}
        onChange={(e) => setPlatformUuid(e.target.value)}
      />
      <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error}>
        {query.data ? (
          <pre className="max-h-[520px] overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">{JSON.stringify(query.data, null, 2)}</pre>
        ) : null}
      </QueryState>
    </div>
  );
}
