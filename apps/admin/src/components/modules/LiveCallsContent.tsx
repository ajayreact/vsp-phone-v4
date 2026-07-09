'use client';

import { motion } from 'framer-motion';
import { Headphones, Mic, PhoneOff, RefreshCw, Share2 } from 'lucide-react';
import { useAuth, usePermissions } from '../../lib/auth/AuthProvider';
import { useLiveCalls } from '../../lib/hooks/queries/use-telecom';
import { getModuleById } from '../../lib/navigation/config';
import { hasPermission } from '../../lib/rbac/permissions';
import type { LiveCallRecord } from '../../types/telecom';
import { DataTable, type Column } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { PermissionDenied } from '../data/PermissionDenied';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { LiveIndicator } from '../ui/LiveIndicator';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

const columns: Column<LiveCallRecord>[] = [
  { key: 'id', header: 'Call ID', cell: (r) => <span className="font-mono text-xs">{r.platformUuid || r.id}</span> },
  { key: 'caller', header: 'Caller', cell: (r) => <span className="font-mono text-xs">{r.caller}</span> },
  { key: 'callee', header: 'Callee', cell: (r) => r.callee },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
  { key: 'extension', header: 'Extension', cell: (r) => r.extension ?? '—' },
  { key: 'trunk', header: 'Trunk', cell: (r) => r.trunk },
  { key: 'codec', header: 'Codec', cell: (r) => r.codec },
  { key: 'mos', header: 'MOS', cell: (r) => (r.mos != null ? r.mos.toFixed(2) : '—') },
  { key: 'jitter', header: 'Jitter', cell: (r) => (r.jitterMs != null ? `${r.jitterMs}ms` : '—') },
  { key: 'loss', header: 'Pkt Loss', cell: (r) => (r.packetLossPct != null ? `${r.packetLossPct}%` : '—') },
  { key: 'duration', header: 'Duration', cell: (r) => `${Math.floor(r.durationSec / 60)}:${String(r.durationSec % 60).padStart(2, '0')}` },
  { key: 'recording', header: 'Recording', cell: (r) => (r.recording ? 'On' : '—') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status.toLowerCase().includes('active') ? 'online' : 'warning'} /> },
];

export function LiveCallsContent() {
  const module = getModuleById('live-calls')!;
  const permissions = usePermissions();
  const { session } = useAuth();
  const query = useLiveCalls(session?.tenantId);

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
          title="Live Calls — NOC"
          description="Real-time active sessions. Auto-refreshes every 5 seconds via observability diagnostics."
          actions={
            <div className="flex items-center gap-2">
              <LiveIndicator label="Auto-refresh 5s" status={query.isError ? 'degraded' : 'online'} />
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          }
        />

        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!query.isLoading && !query.isError && !(query.data?.length)}
          empty={
            <EmptyState
              title="No active calls"
              description="Live call sessions appear when diagnostics returns active CallSession records for your tenant."
            />
          }
          skeleton={
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl" />
              ))}
            </div>
          }
        >
          <DataTable
            columns={columns}
            data={query.data ?? []}
            pageSize={25}
            rowActions={() => [
              { id: 'listen', label: 'Listen', icon: <Headphones className="h-3.5 w-3.5" /> },
              { id: 'whisper', label: 'Whisper', icon: <Mic className="h-3.5 w-3.5" /> },
              { id: 'barge', label: 'Barge', icon: <Share2 className="h-3.5 w-3.5" /> },
              { id: 'hangup', label: 'Hangup', destructive: true, icon: <PhoneOff className="h-3.5 w-3.5" /> },
            ]}
          />
        </QueryState>
      </motion.div>
    </PageContainer>
  );
}
