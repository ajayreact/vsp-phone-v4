'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../../lib/auth/AuthProvider';
import {
  useTenantCompany,
  useUpdateTenantCompany,
} from '../../../lib/hooks/queries/use-tenant-organization';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import { StatusBadge } from '../../ui/Badge';

type CompanyRecord = {
  displayName?: string;
  slug?: string;
  status?: string;
  timezone?: string | null;
  defaultLanguage?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  website?: string | null;
  industry?: string | null;
  companySize?: string | null;
  brandPrimary?: string | null;
  brandSecondary?: string | null;
  defaultCallerId?: string | null;
  emergencyNumber?: string | null;
};

export function CompanyProfileContent() {
  const { session } = useAuth();
  const companyQuery = useTenantCompany();
  const updateCompany = useUpdateTenantCompany();
  const [form, setForm] = useState({
    displayName: '',
    timezone: '',
    defaultLanguage: '',
    businessEmail: '',
    businessPhone: '',
    website: '',
    industry: '',
    companySize: '',
    brandPrimary: '',
    brandSecondary: '',
    defaultCallerId: '',
    emergencyNumber: '',
  });
  const [saved, setSaved] = useState(false);

  const company = companyQuery.data as CompanyRecord | undefined;

  useEffect(() => {
    if (company) {
      setForm({
        displayName: company.displayName ?? '',
        timezone: company.timezone ?? '',
        defaultLanguage: company.defaultLanguage ?? '',
        businessEmail: company.businessEmail ?? '',
        businessPhone: company.businessPhone ?? '',
        website: company.website ?? '',
        industry: company.industry ?? '',
        companySize: company.companySize ?? '',
        brandPrimary: company.brandPrimary ?? '',
        brandSecondary: company.brandSecondary ?? '',
        defaultCallerId: company.defaultCallerId ?? '',
        emergencyNumber: company.emergencyNumber ?? '',
      });
    }
  }, [company]);

  const save = async () => {
    setSaved(false);
    await updateCompany.mutateAsync(form);
    setSaved(true);
  };

  return (
    <ModuleAccessGate moduleId="organization-company">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title={module.label}
            description={module.description}
            actions={
              <Button variant="outline" size="sm" onClick={() => void companyQuery.refetch()} disabled={companyQuery.isFetching}>
                <RefreshCw className={`h-4 w-4 ${companyQuery.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            }
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass-card">
              <CardHeader title="Company Profile" description="Organization identity and defaults." />
              <CardBody>
                <QueryState
                  isLoading={companyQuery.isLoading}
                  isError={companyQuery.isError}
                  error={companyQuery.error}
                  onRetry={() => void companyQuery.refetch()}
                  skeleton={<Skeleton className="h-48 w-full rounded-xl" />}
                >
                  {company ? (
                    <div className="space-y-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Slug</span>
                        <span className="font-mono text-xs">{company.slug}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <StatusBadge status={company.status === 'ACTIVE' ? 'active' : 'warning'} />
                      </div>
                      <label className="block space-y-1.5">
                        <span className="font-medium">Display name</span>
                        <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="font-medium">Timezone</span>
                        <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/New_York" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="font-medium">Default language</span>
                        <Input value={form.defaultLanguage} onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })} placeholder="en" />
                      </label>
                      <div className="flex items-center gap-3 pt-2">
                        <Button onClick={() => void save()} disabled={updateCompany.isPending}>
                          {updateCompany.isPending ? 'Saving…' : 'Save Company'}
                        </Button>
                        {saved ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
                      </div>
                    </div>
                  ) : null}
                </QueryState>
              </CardBody>
            </Card>

            <Card className="glass-card">
              <CardHeader title="Business Details" />
              <CardBody className="space-y-4 text-sm">
                <label className="block space-y-1.5">
                  <span className="font-medium">Business email</span>
                  <Input value={form.businessEmail} onChange={(e) => setForm({ ...form, businessEmail: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Business phone</span>
                  <Input value={form.businessPhone} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Website</span>
                  <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Industry</span>
                  <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Company size</span>
                  <Input value={form.companySize} onChange={(e) => setForm({ ...form, companySize: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Brand primary</span>
                  <Input value={form.brandPrimary} onChange={(e) => setForm({ ...form, brandPrimary: e.target.value })} placeholder="#0F172A" />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Brand secondary</span>
                  <Input value={form.brandSecondary} onChange={(e) => setForm({ ...form, brandSecondary: e.target.value })} placeholder="#2563EB" />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Default Caller ID</span>
                  <Input value={form.defaultCallerId} onChange={(e) => setForm({ ...form, defaultCallerId: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="font-medium">Emergency Number</span>
                  <Input value={form.emergencyNumber} onChange={(e) => setForm({ ...form, emergencyNumber: e.target.value })} />
                </label>
                <p className="text-muted-foreground">
                  Signed in as {session?.email ?? '—'} · Tenant {session?.tenant?.name ?? session?.tenantId ?? '—'}
                </p>
              </CardBody>
            </Card>
          </div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
