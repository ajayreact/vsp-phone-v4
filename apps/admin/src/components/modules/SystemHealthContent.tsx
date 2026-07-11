'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useOpsHealth } from '../../lib/hooks/queries/use-ops';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation';
import { usePortal } from '../../lib/portal/PortalProvider';
import type { InfraHealthCheck } from '../../types/telecom';
import { QueryState } from '../feedback/QueryState';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../lib/utils/cn';

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
  const portal = usePortal();
  const module = getModuleById('system-health', portal)!;
  const permissions = usePermissions();
  const health = useOpsHealth();

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  const components = health.data?.components;
  const readiness = health.data?.readiness;
  const services = components
    ? (Object.entries(components) as [string, InfraHealthCheck][]).map(([id, check]) => ({
        id,
        name: SERVICE_LABELS[id] ?? id,
        ...check,
      }))
    : [];

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title={module.label}
          description={module.description}
          actions={
            <Button variant="outline" size="sm" onClick={() => void health.refetch()} disabled={health.isFetching}>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((svc) => (
              <Card
                key={svc.id}
                className={cn(
                  'glass-card border',
                  statusColor[svc.status as keyof typeof statusColor] ?? statusColor.down,
                )}
              >
                <CardBody className="flex items-center justify-between py-5">
                  <div>
                    <p className="text-sm font-semibold">{svc.name}</p>
                    {svc.message ? <p className="mt-1 text-xs text-muted-foreground">{svc.message}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {svc.latencyMs != null ? (
                      <span className="text-xs text-muted-foreground">{svc.latencyMs}ms</span>
                    ) : null}
                    <StatusBadge status={healthBadge(svc.status)} />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {readiness ? (
            <Card className="glass-card mt-6">
              <CardBody>
                <p className="mb-3 text-sm font-semibold">
                  Deployment Readiness {readiness.ready ? '(Ready)' : '(Not Ready)'}
                </p>
                <div className="space-y-2">
                  {(readiness.checks ?? []).map((check) => (
                    <div
                      key={check.name}
                      className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-sm"
                    >
                      <span>{check.name}</span>
                      <StatusBadge status={check.status === 'pass' || check.status === 'up' ? 'healthy' : 'error'} />
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : null}
        </QueryState>
      </motion.div>
    </PageContainer>
  );
}
