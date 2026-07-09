'use client';

import Link from 'next/link';
import {
  Activity,
  Headphones,
  Phone,
  Server,
  Smartphone,
  Users,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { displayNameFromSession } from '../../lib/rbac/permissions';
import { filterNavByPermissions } from '../../lib/navigation/config';
import { StatCard } from '../data/StatCard';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Badge } from '../ui/Badge';
import { useEffect, useState } from 'react';

type HealthStatus = { status: string; service: string };

export function DashboardContent() {
  const { session } = useAuth();
  const [adminHealth, setAdminHealth] = useState<HealthStatus | null>(null);
  const navItems = filterNavByPermissions(session?.permissions ?? []);
  const displayName = session
    ? displayNameFromSession(session.email, session.profile)
    : 'Administrator';

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setAdminHealth)
      .catch(() => setAdminHealth(null));
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${displayName}. Monitor your organization and jump to common tasks.`}
        actions={
          <Link href="/softphone">
            <Button variant="outline" size="sm">
              <Headphones className="h-4 w-4" />
              Open Softphone
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tenant" value={session?.tenant?.name ?? '—'} hint={session?.tenant?.slug} icon={<Server className="h-5 w-5" />} />
        <StatCard label="Your roles" value={session?.roles.length ?? 0} hint="RBAC assignments" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Portal modules" value={navItems.length} hint="Visible to your permissions" icon={<Activity className="h-5 w-5" />} />
        <StatCard
          label="Admin service"
          value={adminHealth?.status === 'ok' ? 'Healthy' : 'Unknown'}
          hint={adminHealth?.service ?? 'health check'}
          icon={<Smartphone className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Quick actions" description="Common administration tasks" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Link href="/users" className="rounded-lg border border-border p-4 hover:bg-muted">
              <Users className="mb-2 h-5 w-5 text-primary" />
              <p className="font-medium">Manage users</p>
              <p className="text-sm text-muted-foreground">Accounts, profiles, and access</p>
            </Link>
            <Link href="/extensions" className="rounded-lg border border-border p-4 hover:bg-muted">
              <Phone className="mb-2 h-5 w-5 text-primary" />
              <p className="font-medium">Extensions</p>
              <p className="text-sm text-muted-foreground">Numbers and line assignments</p>
            </Link>
            <Link href="/devices" className="rounded-lg border border-border p-4 hover:bg-muted">
              <Smartphone className="mb-2 h-5 w-5 text-primary" />
              <p className="font-medium">Devices</p>
              <p className="text-sm text-muted-foreground">Provisioning and enrollment</p>
            </Link>
            <Link href="/system-health" className="rounded-lg border border-border p-4 hover:bg-muted">
              <Activity className="mb-2 h-5 w-5 text-primary" />
              <p className="font-medium">System health</p>
              <p className="text-sm text-muted-foreground">Platform readiness and infra</p>
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Session" />
          <CardBody className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Signed in as</p>
              <p className="font-medium">{session?.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Permissions</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(session?.permissions ?? []).slice(0, 8).map((p) => (
                  <Badge key={p} tone="outline">
                    {p}
                  </Badge>
                ))}
                {(session?.permissions.length ?? 0) > 8 ? (
                  <Badge tone="default">+{(session?.permissions.length ?? 0) - 8}</Badge>
                ) : null}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
