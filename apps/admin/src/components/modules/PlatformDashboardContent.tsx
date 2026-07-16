'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  Building2,
  Cable,
  Clock,
  CreditCard,
  Database,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  Server,
  Smartphone,
  Timer,
} from 'lucide-react';
import { usePlatformDashboard } from '../../lib/hooks/queries/use-platform';
import type { InfraHealthCheck } from '../../types/telecom';
import { cn } from '../../lib/utils/cn';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Card, CardBody } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function healthBadge(status: string): 'healthy' | 'warning' | 'error' {
  if (status === 'up') return 'healthy';
  if (status === 'degraded') return 'warning';
  return 'error';
}

function healthLabel(status: string): string {
  if (status === 'up') return 'Healthy';
  if (status === 'degraded') return 'Warning';
  return 'Down';
}

const statusColor = {
  up: 'border-success/30 bg-success/5',
  degraded: 'border-warning/30 bg-warning/5',
  down: 'border-destructive/30 bg-destructive/5',
};

const INFRA_SERVICES: Array<{
  id: keyof {
    api: InfraHealthCheck;
    postgres: InfraHealthCheck;
    redis: InfraHealthCheck;
    kamailio: InfraHealthCheck;
    rtpengine: InfraHealthCheck;
  };
  name: string;
  icon: typeof Server;
}> = [
  { id: 'api', name: 'API', icon: Server },
  { id: 'postgres', name: 'PostgreSQL', icon: Database },
  { id: 'redis', name: 'Redis', icon: Activity },
  { id: 'kamailio', name: 'Kamailio', icon: Cable },
  { id: 'rtpengine', name: 'RTPengine', icon: PhoneCall },
];

function KpiSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, row) => (
        <div key={row} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((__, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">{children}</h2>;
}

export function PlatformDashboardContent() {
  const query = usePlatformDashboard();

  return (
    <ModuleAccessGate moduleId="dashboard">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
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
              skeleton={<KpiSkeleton />}
            >
              {query.data ? (
                <div className="space-y-8">
                  {/* Row 1 – Business Overview */}
                  <section className="space-y-3">
                    <SectionTitle>Business Overview</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                      <MetricCard label="Total Tenants" value={query.data.totalTenants ?? 0} icon={Building2} />
                      <MetricCard label="Active Tenants" value={query.data.activeTenants ?? 0} icon={Building2} />
                      <MetricCard
                        label="Pending Approvals"
                        value={query.data.pendingTenantApprovals ?? 0}
                        icon={Clock}
                      />
                      <MetricCard
                        label="Total Purchased DIDs"
                        value={query.data.totalPurchasedDids ?? query.data.telnyxInventory ?? 0}
                        icon={PhoneCall}
                      />
                      <MetricCard label="Assigned DIDs" value={query.data.assignedDids ?? 0} icon={PhoneCall} />
                      <MetricCard
                        label="Available DIDs"
                        value={query.data.unassignedDids ?? 0}
                        icon={PhoneCall}
                        hint={
                          (query.data.reservedDids ?? 0) > 0
                            ? `${query.data.reservedDids} reserved`
                            : undefined
                        }
                      />
                    </div>
                  </section>

                  {/* Row 2 – Live Operations */}
                  <section className="space-y-3">
                    <SectionTitle>Live Operations</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                      <MetricCard
                        label="Registered Devices"
                        value={query.data.registeredDevices ?? 0}
                        icon={Smartphone}
                        hint={`Online ${query.data.onlineDevices ?? 0} · Offline ${query.data.offlineDevices ?? 0}`}
                      />
                      <MetricCard
                        label="Active Calls"
                        value={query.data.concurrentCalls ?? 0}
                        icon={PhoneIncoming}
                      />
                      <MetricCard
                        label="Failed Calls Today"
                        value={query.data.failedCallsToday ?? 0}
                        icon={PhoneOff}
                      />
                      <MetricCard
                        label="Today's Call Minutes"
                        value={query.data.todaysCallMinutes ?? 0}
                        icon={Timer}
                      />
                      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">Carrier Status</p>
                            <div className="flex items-center gap-2">
                              <StatusBadge
                                status={healthBadge(query.data.carrierStatus?.status ?? 'down')}
                              />
                              <span className="text-sm font-semibold">
                                {healthLabel(query.data.carrierStatus?.status ?? 'down')}
                              </span>
                            </div>
                            {query.data.carrierStatus?.latencyMs != null ? (
                              <p className="text-xs text-muted-foreground">
                                {query.data.carrierStatus.latencyMs}ms
                              </p>
                            ) : null}
                          </div>
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Cable className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Row 3 – Financial */}
                  <section className="space-y-3">
                    <SectionTitle>Financial</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricCard label="MRR" value={formatCents(query.data.mrrCents ?? 0)} icon={CreditCard} />
                      <MetricCard
                        label="Carrier Cost"
                        value={formatCents(query.data.carrierCostCents ?? 0)}
                        icon={CreditCard}
                      />
                      <MetricCard
                        label="Gross Margin"
                        value={formatCents(query.data.grossMarginCents ?? 0)}
                        icon={CreditCard}
                      />
                      <MetricCard
                        label="Total Recordings"
                        value={query.data.recordingCount ?? 0}
                        icon={PhoneCall}
                      />
                    </div>
                  </section>

                  {/* Row 4 – Infrastructure Health */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <SectionTitle>Infrastructure Health</SectionTitle>
                      <span className="text-xs text-muted-foreground">
                        Last health check {new Date(query.data.ts).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                      {INFRA_SERVICES.map((svc) => {
                        const check = query.data.components?.[svc.id];
                        const status = check?.status ?? 'down';
                        const Icon = svc.icon;
                        return (
                          <Card
                            key={svc.id}
                            className={cn(
                              'glass-card border',
                              statusColor[status as keyof typeof statusColor] ?? statusColor.down,
                            )}
                          >
                            <CardBody className="flex items-start justify-between gap-3 py-5">
                              <div className="min-w-0 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <p className="text-sm font-semibold">{svc.name}</p>
                                </div>
                                <StatusBadge status={healthBadge(status)} />
                                <p className="text-xs text-muted-foreground">
                                  {check?.lastSuccessfulCheck
                                    ? `Last OK ${new Date(check.lastSuccessfulCheck).toLocaleString()}`
                                    : `Checked ${new Date(query.data.ts).toLocaleString()}`}
                                </p>
                                {check?.latencyMs != null ? (
                                  <p className="text-xs text-muted-foreground">{check.latencyMs}ms</p>
                                ) : null}
                              </div>
                            </CardBody>
                          </Card>
                        );
                      })}
                    </div>
                  </section>
                </div>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
