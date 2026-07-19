'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Search, Shield } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useOpsHealth } from '../../lib/hooks/queries/use-ops';
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
import type { InfraHealthCheck } from '../../types/telecom';
import { DataTable, type Column } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { QueryState } from '../feedback/QueryState';
import { ModuleAccessGate } from './shared/ModuleShell';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { LiveIndicator } from '../ui/LiveIndicator';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils/cn';
import { CarriersOpsDashboard } from './noc/CarriersOpsDashboard';
import { KamailioOpsDashboard } from './noc/KamailioOpsDashboard';
import { PlatformHealthDashboard } from './noc/PlatformHealthDashboard';
import { RawJsonPanel } from './noc/RawJsonPanel';
import { RtpengineOpsDashboard } from './noc/RtpengineOpsDashboard';

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
  const health = useOpsHealth();
  const alerts = useNocAlerts('OPEN');
  const components = (health.data?.components ?? data.data?.infrastructure) as
    | Record<string, InfraHealthCheck | undefined>
    | undefined;

  return (
    <QueryState
      isLoading={data.isLoading && health.isLoading}
      isError={data.isError && health.isError}
      error={data.error ?? health.error}
      skeleton={<Skeleton className="h-64" />}
    >
      <div className={cn(wallboard && 'rounded-2xl bg-zinc-950 p-6 text-zinc-50')}>
        {data.data ? (
          <div className="mb-4 flex items-center gap-2">
            <StatusBadge status={statusBadge(data.data.platformStatus)} />
            <span className="text-sm text-muted-foreground">Platform {data.data.platformStatus}</span>
          </div>
        ) : null}
        <PlatformHealthDashboard
          components={components}
          concurrentCalls={data.data?.concurrentCalls ?? null}
          registrations={
            data.data
              ? data.data.registeredSipPhones + data.data.registeredWebrtcClients
              : null
          }
          alertCount={alerts.data?.length ?? null}
          raw={{ noc: data.data, health: health.data }}
        />
      </div>
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
  const [submitted, setSubmitted] = useState<{ callId?: string; platformUuid?: string } | null>(null);
  const query = useNocSipTrace(
    {
      tenantId,
      callId: submitted?.callId,
      platformUuid: submitted?.platformUuid,
    },
    Boolean(submitted && (submitted.callId || submitted.platformUuid)),
  );

  const runSearch = () => {
    setSubmitted({
      callId: callId.trim() || undefined,
      platformUuid: platformUuid.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Call-ID" value={callId} onChange={(e) => setCallId(e.target.value)} />
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Platform UUID" value={platformUuid} onChange={(e) => setPlatformUuid(e.target.value)} />
        <Button size="sm" onClick={runSearch} disabled={!callId.trim() && !platformUuid.trim()}>
          <Search className="h-4 w-4" /> Search
        </Button>
      </div>
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!submitted}
        empty={
          <EmptyState
            title="Enter trace criteria"
            description="Provide a Call-ID or Platform UUID, then click Search to load SIP trace events."
          />
        }
      >
        <RawJsonPanel data={query.data} title="Show Raw Trace JSON" />
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
  const registrations = useNocSipRegistrations();
  const registrationCount = registrations.data?.length ?? null;
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      {query.data ? (
        <KamailioOpsDashboard
          data={query.data as Record<string, unknown>}
          registrationCount={registrationCount}
        />
      ) : null}
    </QueryState>
  );
}

function RtpenginePanel({ tenantId }: { tenantId?: string }) {
  const query = useNocRtpengine(tenantId);
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      {query.data ? <RtpengineOpsDashboard data={query.data as Record<string, unknown>} /> : null}
    </QueryState>
  );
}

function CarriersPanel() {
  const query = useNocCarriers();
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} skeleton={<Skeleton className="h-64" />}>
      {query.data ? <CarriersOpsDashboard data={query.data as Record<string, unknown>} /> : null}
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
      {run.data ? <RawJsonPanel data={run.data} title="Show Raw Synthetic Results" /> : null}
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
        {query.data ? <RawJsonPanel data={query.data} title="Show Raw Diagnostics JSON" /> : null}
      </QueryState>
    </div>
  );
}
