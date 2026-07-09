'use client';

import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { IntegrationBadge } from '../data/IntegrationBadge';
import { getModuleById } from '../../lib/navigation/config';
import { PermissionDenied } from '../data/PermissionDenied';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { hasPermission } from '../../lib/rbac/permissions';
import { Badge } from '../ui/Badge';

type ReadinessPayload = {
  ready?: boolean;
  checks?: Array<{ name: string; status: string; message?: string }>;
};

export function SystemHealthContent() {
  const module = getModuleById('system-health')!;
  const permissions = usePermissions();
  const [data, setData] = useState<ReadinessPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/bff/readiness')
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={module.label}
        description={module.description}
        actions={<IntegrationBadge status="bff" />}
      />
      {error ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Configure <code className="rounded bg-muted px-1">TELECOM_SERVICE_AUTH_TOKEN</code> on the admin server for BFF proxy access.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Production readiness" />
            <CardBody>
              <div className="flex items-center gap-2">
                <Badge tone={data?.ready ? 'success' : 'warning'}>
                  {data?.ready ? 'Ready' : data ? 'Not ready' : 'Loading…'}
                </Badge>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {(data?.checks ?? []).slice(0, 12).map((c) => (
                  <li key={c.name} className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
                    <span>{c.name}</span>
                    <Badge tone={c.status === 'pass' ? 'success' : 'warning'}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Dependencies" description="Core platform services" />
            <CardBody className="space-y-2 text-sm text-muted-foreground">
              <p>API · PostgreSQL · Redis · Kamailio · RTPengine</p>
              <p>Metrics proxied via Next.js BFF using service authentication.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
