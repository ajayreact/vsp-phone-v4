'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSipTrunks } from '../../lib/hooks/queries/use-telecom';
import { getModuleById } from '../../lib/navigation';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import type { SipTrunkRecord } from '../../types/telecom';
import { DataTable, type Column } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { PermissionDenied } from '../data/PermissionDenied';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

const columns: Column<SipTrunkRecord>[] = [
  { key: 'name', header: 'Trunk', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'carrier', header: 'Carrier', cell: (r) => r.carrier },
  { key: 'host', header: 'Host', cell: (r) => <span className="font-mono text-xs">{r.sipHost}</span> },
  { key: 'registration', header: 'Registration', cell: (r) => <StatusBadge status={r.registration === 'registered' ? 'online' : 'offline'} /> },
  { key: 'options', header: 'OPTIONS', cell: (r) => (r.optionsPingMs != null ? `${r.optionsPingMs}ms` : '—') },
  { key: 'latency', header: 'Latency', cell: (r) => `${r.latencyMs}ms` },
  { key: 'loss', header: 'Packet Loss', cell: (r) => `${r.packetLossPct}%` },
  { key: 'channels', header: 'Channels', cell: (r) => `${r.channelsInUse}/${r.channelsTotal}` },
  { key: 'concurrent', header: 'Concurrent', cell: (r) => String((r as SipTrunkRecord & { concurrentCalls?: number }).concurrentCalls ?? r.channelsInUse) },
  { key: 'peak', header: 'Peak Today', cell: (r) => String(r.peakCallsToday) },
  { key: 'failover', header: 'Failover', cell: (r) => (r.failoverEnabled ? 'Enabled' : 'Disabled') },
  { key: 'health', header: 'Health', cell: (r) => <StatusBadge status={r.health === 'up' ? 'healthy' : r.health === 'degraded' ? 'warning' : 'error'} /> },
];

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (!values.length) return <p className="text-xs text-muted-foreground">Collecting samples…</p>;
  const max = Math.max(...values, 1);
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex h-16 items-end gap-1">
        {values.slice(-24).map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-primary/70"
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
            title={String(v)}
          />
        ))}
      </div>
    </div>
  );
}

export function TrunksContent() {
  const module = getModuleById('trunks')!;
  const permissions = usePermissions();
  const query = useSipTrunks();
  const [history, setHistory] = useState<{ latency: number[]; loss: number[]; usage: number[] }>({
    latency: [],
    loss: [],
    usage: [],
  });

  const trunks = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    if (!trunks.length) return;
    const avgLatency = trunks.reduce((s, t) => s + t.latencyMs, 0) / trunks.length;
    const avgLoss = trunks.reduce((s, t) => s + t.packetLossPct, 0) / trunks.length;
    const usage = trunks.reduce((s, t) => s + t.channelsInUse, 0);
    setHistory((h) => ({
      latency: [...h.latency, avgLatency].slice(-24),
      loss: [...h.loss, avgLoss].slice(-24),
      usage: [...h.usage, usage].slice(-24),
    }));
  }, [trunks, query.dataUpdatedAt]);

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="SIP Trunks"
          description="Live Telnyx trunk registration, OPTIONS ping, latency, and channel utilization. Auto-refreshes every 10s."
          actions={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!trunks.length}
          empty={
            <EmptyState
              title="No SIP trunks configured"
              description="Configure Telnyx carrier records in PostgreSQL to monitor trunk health."
            />
          }
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <Card className="glass-panel">
              <CardHeader title="Latency trend" />
              <CardBody className="pt-0"><Sparkline values={history.latency} label="Avg ms (24 samples)" /></CardBody>
            </Card>
            <Card className="glass-panel">
              <CardHeader title="Packet loss trend" />
              <CardBody className="pt-0"><Sparkline values={history.loss} label="Avg % (24 samples)" /></CardBody>
            </Card>
            <Card className="glass-panel">
              <CardHeader title="Channel usage" />
              <CardBody className="pt-0"><Sparkline values={history.usage} label="Concurrent channels" /></CardBody>
            </Card>
          </div>
          <DataTable columns={columns} data={trunks} />
        </QueryState>
      </motion.div>
    </PageContainer>
  );
}
