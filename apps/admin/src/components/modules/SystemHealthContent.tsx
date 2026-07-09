'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useInfraHealth } from '../../lib/hooks/queries/use-telecom';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation/config';
import type { InfraHealthCheck } from '../../types/telecom';
import { QueryState } from '../feedback/QueryState';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils/cn';

type ReadinessPayload = {
  ready?: boolean;
  checks?: Array<{ name: string; status: string; message?: string }>;
};

const SERVICE_LABELS: Record<string, string> = {
  api: 'API Gateway',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  kamailio: 'Kamailio',
  rtpengine: 'RTPengine',
  telnyx: 'Telnyx Carrier',
};

const statusColor = {
  up: 'border-success/30 bg-success/5',
  degraded: 'border-warning/30 bg-warning/5',
  down: 'border-destructive/30 bg-destructive/5',
};

function healthBadge(status: string): 'healthy' | 'warning' | 'error' {
  if (status === 'up') return 'healthy';
  if (status === 'degraded') return 'warning';
  return 'error';
}

export function SystemHealthContent() {
  const module = getModuleById('system-health')!;
  const permissions = usePermissions();
  const health = useInfraHealth();

  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: async (): Promise<ReadinessPayload | null> => {
      const r = await fetch('/api/bff/readiness');
      return r.ok ? r.json() : null;
    },
    refetchInterval: 30_000,
  });

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  const infra = health.data;
  const services = infra
    ? (Object.entries(infra) as [string, InfraHealthCheck][]).map(([id, check]) => ({
        id,
        name: SERVICE_LABELS[id] ?? id,
        ...check,
      }))
    : [];

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="System Health"
          description="Live infrastructure status from observability health checks."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void health.refetch();
                void readiness.refetch();
              }}
            >
              <RefreshCw className={`h-4 w-4 ${health.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        <QueryState
          isLoading={health.isLoading}
          isError={health.isError}
          error={health.error}
          onRetry={() => void health.refetch()}
          skeleton={
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          }
        >
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((s) => (
              <Card
                key={s.id}
                className={cn(
                  'glass-panel overflow-hidden transition-all duration-200 hover:shadow-[var(--shadow-elevated)]',
                  statusColor[s.status],
                )}
              >
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold tracking-tight">{s.name}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {s.latencyMs != null ? `${s.latencyMs}ms` : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Latency</p>
                    </div>
                    <StatusBadge status={healthBadge(s.status)} />
                  </div>
                  {s.message ? (
                    <p className="mt-3 text-xs text-muted-foreground">{s.message}</p>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        </QueryState>

        {readiness.data?.checks?.length ? (
          <Card className="glass-panel">
            <CardBody>
              <h3 className="mb-4 text-base font-semibold">Production readiness checks</h3>
              <ul className="divide-y divide-border">
                {readiness.data.checks.map((c) => (
                  <li key={c.name} className="flex items-center justify-between py-3 text-sm">
                    <span>{c.name}</span>
                    <StatusBadge status={c.status === 'pass' ? 'healthy' : 'warning'} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : readiness.isLoading ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : null}
      </motion.div>
    </PageContainer>
  );
}
