'use client';

import { useEffect, useState } from 'react';
import { useAuth, usePermissions } from '../../lib/auth/AuthProvider';
import {
  useTenantCompany,
  useUpdateTenantCompany,
} from '../../lib/hooks/queries/use-tenant-organization';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';

export function TenantSettingsContent({ section }: { section: 'pbx' | 'security' }) {
  const { session } = useAuth();
  const permissions = usePermissions();
  const companyQuery = useTenantCompany();
  const updateCompany = useUpdateTenantCompany();
  const [form, setForm] = useState({ timezone: '', defaultLanguage: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (companyQuery.data) {
      const d = companyQuery.data as { timezone?: string | null; defaultLanguage?: string | null };
      setForm({
        timezone: d.timezone ?? '',
        defaultLanguage: d.defaultLanguage ?? '',
      });
    }
  }, [companyQuery.data]);

  const moduleId = section === 'pbx' ? 'settings-pbx' : 'settings-security';

  const savePbx = async () => {
    setSaved(false);
    await updateCompany.mutateAsync({
      timezone: form.timezone,
      defaultLanguage: form.defaultLanguage,
    });
    setSaved(true);
  };

  return (
    <ModuleAccessGate moduleId={moduleId}>
      {({ module }) => (
        <PageContainer>
          <PageHeader title={module.label} description={module.description} />
          {section === 'pbx' ? (
            <Card className="glass-card max-w-xl">
              <CardHeader title="PBX Defaults" description="Tenant-wide telephony defaults." />
              <CardBody>
                <QueryState
                  isLoading={companyQuery.isLoading}
                  isError={companyQuery.isError}
                  error={companyQuery.error}
                  onRetry={() => void companyQuery.refetch()}
                  skeleton={<Skeleton className="h-32 w-full rounded-xl" />}
                >
                  <div className="space-y-4 text-sm">
                    <label className="block space-y-1.5">
                      <span className="font-medium">Default timezone</span>
                      <Input
                        value={form.timezone}
                        onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                        placeholder="America/New_York"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="font-medium">Default language</span>
                      <Input
                        value={form.defaultLanguage}
                        onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
                        placeholder="en"
                      />
                    </label>
                    <div className="flex items-center gap-3">
                      <Button onClick={() => void savePbx()} disabled={updateCompany.isPending}>
                        {updateCompany.isPending ? 'Saving…' : 'Save PBX Settings'}
                      </Button>
                      {saved ? <span className="text-muted-foreground">Saved.</span> : null}
                    </div>
                  </div>
                </QueryState>
              </CardBody>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader title="Session" description="Current authenticated user." />
                <CardBody className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{session?.email ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{session?.userId ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenant</span>
                    <span>{session?.tenant?.name ?? session?.tenantId ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Roles</span>
                    <span>{session?.roles.map((r) => r.name).join(', ') || '—'}</span>
                  </div>
                </CardBody>
              </Card>
              <Card className="glass-card">
                <CardHeader title="Access Control" description="Permissions are managed via tenant roles." />
                <CardBody className="text-sm text-muted-foreground space-y-2">
                  <p>Contact your tenant administrator to adjust role assignments or MFA policies.</p>
                  <p>
                    Effective permissions:{' '}
                    <span className="text-foreground">{permissions.length} granted</span>
                  </p>
                </CardBody>
              </Card>
            </div>
          )}
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
