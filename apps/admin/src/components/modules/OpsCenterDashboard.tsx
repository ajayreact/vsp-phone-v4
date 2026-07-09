'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Building2,
  Cable,
  PhoneCall,
  PhoneIncoming,
  RefreshCw,
  Smartphone,
  Users,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useInfraHealth, useLiveCalls, useOpsDashboard } from '../../lib/hooks/queries/use-telecom';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { LiveIndicator } from '../ui/LiveIndicator';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

function healthToBadge(status: string): 'healthy' | 'warning' | 'error' {
  if (status === 'up') return 'healthy';
  if (status === 'degraded') return 'warning';
  return 'error';
}

export function OpsCenterDashboard() {
  const { session } = useAuth();
  const tenantId = session?.tenantId;
  const dashboard = useOpsDashboard(tenantId);
  const health = useInfraHealth();
  const liveCalls = useLiveCalls(tenantId);

  const snap = dashboard.data;
  const infra = health.data ?? snap?.infrastructure;

  return (
    <PageContainer>
      <motion.div {...fade}>
        <PageHeader
          title="Telecom Operations Dashboard"
          description="Live platform telemetry — calls, registrations, carrier health, and infrastructure."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <LiveIndicator
                label={dashboard.isFetching ? 'Syncing…' : 'Telemetry active'}
                status={dashboard.isError ? 'degraded' : 'online'}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void dashboard.refetch();
                  void health.refetch();
                  void liveCalls.refetch();
                }}
                disabled={dashboard.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link href="/telnyx-numbers">
                <Button size="sm">
                  <PhoneCall className="h-4 w-4" />
                  Telnyx Numbers
                </Button>
              </Link>
            </div>
          }
        />

        <QueryState
          isLoading={dashboard.isLoading}
          isError={dashboard.isError}
          error={dashboard.error}
          onRetry={() => void dashboard.refetch()}
          skeleton={<KpiSkeleton />}
        >
          {snap ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Live Calls" value={snap.activeCalls} icon={PhoneIncoming} />
                <MetricCard label="Concurrent Calls" value={snap.concurrentCalls ?? snap.activeCalls} icon={PhoneIncoming} />
                <MetricCard label="Registered Extensions" value={snap.registeredExtensions ?? 0} icon={Users} />
                <MetricCard label="Registered Devices" value={snap.registeredDevices} icon={Smartphone} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Available DIDs" value={snap.availableDids ?? snap.unassignedDids ?? 0} icon={PhoneCall} />
                <MetricCard label="Assigned DIDs" value={snap.assignedDids ?? 0} icon={PhoneCall} />
                <MetricCard label="Telnyx Inventory" value={snap.telnyxInventory ?? 0} icon={Cable} />
                <MetricCard label="SIP Registrations" value={snap.sipRegistrations ?? snap.registeredDevices} icon={Activity} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Active Tenants" value={snap.onlineTenants} icon={Building2} />
                <MetricCard label="Queue Waiting" value={snap.queueWaiting ?? snap.activeQueues} icon={Users} />
                <MetricCard label="Failed Calls Today" value={snap.failedCallsToday ?? 0} icon={PhoneIncoming} />
                <MetricCard
                  label="Carrier Health"
                  value={
                    infra?.telnyx?.status === 'up'
                      ? 'Healthy'
                      : infra?.telnyx?.status === 'degraded'
                        ? 'Degraded'
                        : infra?.telnyx?.status === 'down'
                          ? 'Down'
                          : 'Unknown'
                  }
                  hint={infra?.telnyx?.latencyMs != null ? `${infra.telnyx.latencyMs}ms` : undefined}
                  icon={Cable}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Snapshot {new Date(snap.ts).toLocaleString()} · Tenant scope: {snap.tenantId}
              </p>
            </>
          ) : null}
        </QueryState>

        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          <Card className="glass-card xl:col-span-2">
            <CardHeader
              title="Live Calls"
              action={
                <Link href="/live-calls">
                  <Button variant="ghost" size="sm">
                    NOC view
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
            <CardBody className="pt-0">
              <QueryState
                isLoading={liveCalls.isLoading}
                isError={liveCalls.isError}
                error={liveCalls.error}
                onRetry={() => void liveCalls.refetch()}
                isEmpty={!liveCalls.data?.length}
                empty={
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No active calls for the current tenant scope.
                    {!tenantId ? ' Sign in with a tenant context to load live sessions.' : null}
                  </p>
                }
                skeleton={<Skeleton className="h-48 w-full rounded-xl" />}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Caller</th>
                        <th className="pb-3 pr-4 font-medium">Callee</th>
                        <th className="pb-3 pr-4 font-medium">Trunk</th>
                        <th className="pb-3 pr-4 font-medium">Codec</th>
                        <th className="pb-3 pr-4 font-medium">MOS</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(liveCalls.data ?? []).slice(0, 8).map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30">
                          <td className="py-3 pr-4 font-mono text-xs">{c.caller}</td>
                          <td className="py-3 pr-4">{c.callee}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{c.trunk}</td>
                          <td className="py-3 pr-4">{c.codec}</td>
                          <td className="py-3 pr-4 tabular-nums">{c.mos ?? '—'}</td>
                          <td className="py-3">
                            <StatusBadge status={c.status.toLowerCase().includes('active') ? 'online' : 'warning'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </QueryState>
            </CardBody>
          </Card>

          <Card className="glass-card">
            <CardHeader
              title="Infrastructure"
              action={
                <Link href="/system-health">
                  <Button variant="ghost" size="sm">Details</Button>
                </Link>
              }
            />
            <CardBody className="space-y-2 pt-0">
              {health.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)
              ) : health.isError ? (
                <p className="text-sm text-muted-foreground">{health.error?.message}</p>
              ) : infra ? (
                (['api', 'kamailio', 'redis', 'postgres', 'rtpengine', 'telnyx'] as const).map((key) => {
                  const check = infra[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 px-4 py-3"
                    >
                      <span className="text-sm font-medium capitalize">{key}</span>
                      <div className="flex items-center gap-2">
                        {check?.latencyMs != null ? (
                          <span className="text-xs text-muted-foreground">{check.latencyMs}ms</span>
                        ) : null}
                        <StatusBadge status={healthToBadge(check?.status ?? 'down')} />
                      </div>
                    </div>
                  );
                })
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Redis: {snap?.redis.available ? 'Available' : 'Unavailable'}</span>
                <span>Postgres: {snap?.postgres.connected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Link href="/trunks" className="glass-card block rounded-2xl border border-border p-5 transition hover:border-primary/30">
            <p className="text-sm font-semibold">SIP Trunks</p>
            <p className="mt-1 text-xs text-muted-foreground">Registration, latency, channels</p>
          </Link>
          <Link href="/telnyx-numbers" className="glass-card block rounded-2xl border border-border p-5 transition hover:border-primary/30">
            <p className="text-sm font-semibold">Telnyx Numbers</p>
            <p className="mt-1 text-xs text-muted-foreground">Inventory & tenant assignment</p>
          </Link>
          <Link href="/extensions" className="glass-card block rounded-2xl border border-border p-5 transition hover:border-primary/30">
            <p className="text-sm font-semibold">Extensions</p>
            <p className="mt-1 text-xs text-muted-foreground">Registrations & presence</p>
          </Link>
        </div>
      </motion.div>
    </PageContainer>
  );
}
