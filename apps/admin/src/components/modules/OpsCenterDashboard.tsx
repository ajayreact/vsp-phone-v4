'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, PhoneCall, RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useLiveCalls, useOpsDashboard } from '../../lib/hooks/queries/use-telecom';
import { useOpsHealth } from '../../lib/hooks/queries/use-ops';
import { useNocAlerts } from '../../lib/hooks/queries/use-telecom-noc';
import type { InfraHealthCheck } from '../../types/telecom';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { LiveIndicator } from '../ui/LiveIndicator';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { OpsSection } from './noc/OpsSection';
import { PlatformHealthDashboard } from './noc/PlatformHealthDashboard';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

export function OpsCenterDashboard() {
  const { session } = useAuth();
  const tenantId = session?.tenantId;
  const dashboard = useOpsDashboard(tenantId);
  const health = useOpsHealth();
  const liveCalls = useLiveCalls(tenantId);
  const alerts = useNocAlerts('OPEN');

  const snap = dashboard.data;
  const components = health.data?.components ?? snap?.infrastructure;

  return (
    <PageContainer>
      <motion.div {...fade}>
        <PageHeader
          title="Telecom Operations Dashboard"
          description="Enterprise NOC — platform health, live traffic, and infrastructure telemetry."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <LiveIndicator
                label={dashboard.isFetching || health.isFetching ? 'Syncing…' : 'Telemetry active'}
                status={dashboard.isError || health.isError ? 'degraded' : 'online'}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void dashboard.refetch();
                  void health.refetch();
                  void liveCalls.refetch();
                  void alerts.refetch();
                }}
                disabled={dashboard.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link href="/telecom-noc">
                <Button size="sm">
                  <PhoneCall className="h-4 w-4" />
                  Open NOC
                </Button>
              </Link>
            </div>
          }
        />

        <QueryState
          isLoading={dashboard.isLoading && health.isLoading}
          isError={dashboard.isError && health.isError}
          error={dashboard.error ?? health.error}
          onRetry={() => {
            void dashboard.refetch();
            void health.refetch();
          }}
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <PlatformHealthDashboard
            components={components as Record<string, InfraHealthCheck | undefined>}
            concurrentCalls={snap?.concurrentCalls ?? snap?.activeCalls ?? null}
            registrations={snap?.sipRegistrations ?? snap?.registeredDevices ?? null}
            alertCount={alerts.data?.length ?? null}
            raw={{ health: health.data, dashboard: snap }}
          />
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
              title="Open Alerts"
              action={
                <Link href="/telecom-noc">
                  <Button variant="ghost" size="sm">
                    Alerts
                  </Button>
                </Link>
              }
            />
            <CardBody className="space-y-2 pt-0">
              {(alerts.data ?? []).slice(0, 8).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No open alerts.</p>
              ) : (
                (alerts.data ?? []).slice(0, 8).map((a) => (
                  <div key={a.id} className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{a.title}</p>
                      <span className="text-xs uppercase text-muted-foreground">{a.severity}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.source}</p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <OpsSection title="Quick Links" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Link href="/kamailio" className="glass-card block rounded-2xl border border-border p-5 transition hover:border-primary/30">
              <p className="text-sm font-semibold">Kamailio</p>
              <p className="mt-1 text-xs text-muted-foreground">Registrations, dialogs, dispatcher</p>
            </Link>
            <Link href="/rtpengine" className="glass-card block rounded-2xl border border-border p-5 transition hover:border-primary/30">
              <p className="text-sm font-semibold">RTPengine</p>
              <p className="mt-1 text-xs text-muted-foreground">Sessions, MOS, packet loss</p>
            </Link>
            <Link href="/carriers" className="glass-card block rounded-2xl border border-border p-5 transition hover:border-primary/30">
              <p className="text-sm font-semibold">Carriers</p>
              <p className="mt-1 text-xs text-muted-foreground">API, trunks, latency</p>
            </Link>
          </div>
        </OpsSection>
      </motion.div>
    </PageContainer>
  );
}
