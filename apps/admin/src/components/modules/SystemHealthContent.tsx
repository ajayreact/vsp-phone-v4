'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mockHealthServices } from '../../lib/mock/data';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation/config';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { cn } from '../../lib/utils/cn';

type ReadinessPayload = {
  ready?: boolean;
  checks?: Array<{ name: string; status: string; message?: string }>;
};

const statusColor = {
  healthy: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  error: 'border-destructive/30 bg-destructive/5',
};

export function SystemHealthContent() {
  const module = getModuleById('system-health')!;
  const permissions = usePermissions();
  const [live, setLive] = useState<ReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bff/readiness')
      .then(async (r) => (r.ok ? r.json() : null))
      .then(setLive)
      .catch(() => setLive(null))
      .finally(() => setLoading(false));
  }, []);

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  const services = mockHealthServices.map((s) => {
    if (s.id === 'api' && live) {
      return { ...s, status: live.ready ? 'healthy' as const : 'warning' as const };
    }
    return s;
  });

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="System Health"
          description="Real-time status of platform services and dependencies."
          actions={
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          }
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((s) => (
            <Card
              key={s.id}
              className={cn('overflow-hidden transition-shadow hover:shadow-[var(--shadow-elevated)]', statusColor[s.status])}
            >
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold tracking-tight">{s.name}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{s.latencyMs}ms</p>
                    <p className="text-xs text-muted-foreground">Latency</p>
                  </div>
                  <StatusBadge status={s.status === 'healthy' ? 'healthy' : s.status === 'warning' ? 'warning' : 'error'} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4 text-sm">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="font-medium">{s.uptime}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {live?.checks?.length ? (
          <Card>
            <CardBody>
              <h3 className="mb-4 text-base font-semibold">Production readiness checks</h3>
              <ul className="divide-y divide-border">
                {live.checks.map((c) => (
                  <li key={c.name} className="flex items-center justify-between py-3 text-sm">
                    <span>{c.name}</span>
                    <StatusBadge status={c.status === 'pass' ? 'healthy' : 'warning'} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading live readiness data…</p>
        ) : null}
      </motion.div>
    </PageContainer>
  );
}
