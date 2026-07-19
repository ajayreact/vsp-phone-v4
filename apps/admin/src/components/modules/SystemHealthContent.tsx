'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useOpsHealth } from '../../lib/hooks/queries/use-ops';
import { usePlatformSystemHealth } from '../../lib/hooks/queries/use-platform';
import { usePortal } from '../../lib/portal/PortalProvider';
import type { InfraHealthCheck } from '../../types/telecom';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { ModuleAccessGate } from './shared/ModuleShell';
import { OpsSection } from './noc/OpsSection';
import { PlatformHealthDashboard } from './noc/PlatformHealthDashboard';

export function SystemHealthContent() {
  const portal = usePortal();
  const isPlatform = portal === 'platform';
  const platformHealth = usePlatformSystemHealth({ enabled: isPlatform });
  const opsHealth = useOpsHealth({ enabled: !isPlatform });
  const health = isPlatform ? platformHealth : opsHealth;

  return (
    <ModuleAccessGate moduleId="system-health">
      {({ module }) => {
        const components = (health.data?.components ?? {}) as Record<string, InfraHealthCheck | undefined>;
        const readiness = health.data?.readiness;

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
                skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
              >
                <PlatformHealthDashboard components={components} raw={health.data} />

                {readiness ? (
                  <OpsSection title="Deployment Readiness" className="mt-6">
                    <Card className="glass-card">
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
                              <StatusBadge
                                status={check.status === 'pass' || check.status === 'up' ? 'healthy' : 'error'}
                              />
                            </div>
                          ))}
                        </div>
                      </CardBody>
                    </Card>
                  </OpsSection>
                ) : null}
              </QueryState>
            </motion.div>
          </PageContainer>
        );
      }}
    </ModuleAccessGate>
  );
}
