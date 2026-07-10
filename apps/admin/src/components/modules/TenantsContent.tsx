'use client';

import { useState } from 'react';
import { useOnboardTenant, usePlatformTenants } from '../../lib/hooks/queries/use-platform';
import type { PlatformTenantRecord } from '../../types/portal';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type TenantRow = PlatformTenantRecord & { id: string };

const columns: Column<TenantRow>[] = [
  { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{r.displayName || r.name}</span> },
  { key: 'slug', header: 'Slug', cell: (r) => <span className="font-mono text-xs">{r.slug}</span> },
  { key: 'publicId', header: 'Public ID', cell: (r) => <span className="font-mono text-xs">{r.publicId}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'ACTIVE' ? 'active' : r.status === 'SUSPENDED' ? 'warning' : 'pending'} /> },
  { key: 'created', header: 'Created', cell: (r) => <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span> },
];

const emptyForm = {
  name: '',
  displayName: '',
  siteName: 'Main Office',
  timezone: 'America/New_York',
  adminEmail: '',
  adminPassword: '',
  adminFirstName: '',
  adminLastName: '',
};

export function TenantsContent() {
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const query = usePlatformTenants(search ? { search } : undefined);
  const onboard = useOnboardTenant();
  const rows = withRowIds(query.data ?? []) as TenantRow[];

  const resetWizard = () => {
    setForm(emptyForm);
    setStep(0);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    try {
      await onboard.mutateAsync({
        name: form.name,
        displayName: form.displayName || form.name,
        siteName: form.siteName,
        timezone: form.timezone,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        adminFirstName: form.adminFirstName,
        adminLastName: form.adminLastName,
      });
      setWizardOpen(false);
      resetWizard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onboarding failed');
    }
  };

  return (
    <ModuleAccessGate moduleId="tenants">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tenants by name or slug…"
            emptyTitle="No tenants yet"
            emptyDescription="Run the onboarding wizard to provision your first tenant organization."
            primaryAction={<CreateButton label="Onboard Tenant" onClick={() => setWizardOpen(true)} />}
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />

          <SlideOver
            open={wizardOpen}
            onClose={() => {
              setWizardOpen(false);
              resetWizard();
            }}
            title="Tenant Onboarding Wizard"
            description="Provision tenant organization, default site, RBAC, and admin user."
            width="lg"
            footer={
              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => (step > 0 ? setStep(step - 1) : setWizardOpen(false))}>
                  {step > 0 ? 'Back' : 'Cancel'}
                </Button>
                {step < 2 ? (
                  <Button onClick={() => setStep(step + 1)} disabled={!canAdvance(step, form)}>
                    Continue
                  </Button>
                ) : (
                  <Button onClick={() => void submit()} disabled={onboard.isPending}>
                    {onboard.isPending ? 'Provisioning…' : 'Complete Onboarding'}
                  </Button>
                )}
              </div>
            }
          >
            <div className="space-y-4">
              <WizardSteps step={step} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {step === 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Organization name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
                  <Field label="Display name" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
                  <Field label="Default site" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} />
                  <Field label="Timezone" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} />
                </div>
              ) : null}
              {step === 1 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Admin first name" value={form.adminFirstName} onChange={(v) => setForm({ ...form, adminFirstName: v })} required />
                  <Field label="Admin last name" value={form.adminLastName} onChange={(v) => setForm({ ...form, adminLastName: v })} required />
                  <Field label="Admin email" value={form.adminEmail} onChange={(v) => setForm({ ...form, adminEmail: v })} required type="email" />
                  <Field label="Temporary password" value={form.adminPassword} onChange={(v) => setForm({ ...form, adminPassword: v })} required type="password" />
                </div>
              ) : null}
              {step === 2 ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Review</p>
                  <ul className="mt-3 space-y-2 text-muted-foreground">
                    <li>Organization: {form.displayName || form.name}</li>
                    <li>Site: {form.siteName}</li>
                    <li>Timezone: {form.timezone}</li>
                    <li>Admin: {form.adminFirstName} {form.adminLastName} ({form.adminEmail})</li>
                  </ul>
                  <p className="mt-3 text-xs">RBAC roles and permissions will be seeded automatically.</p>
                </div>
              ) : null}
            </div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}

function WizardSteps({ step }: { step: number }) {
  const labels = ['Organization', 'Admin User', 'Review'];
  return (
    <div className="flex gap-2">
      {labels.map((label, i) => (
        <div
          key={label}
          className={`rounded-full px-3 py-1 text-xs font-medium ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          {i + 1}. {label}
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}{required ? ' *' : ''}</span>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </label>
  );
}

function canAdvance(step: number, form: typeof emptyForm): boolean {
  if (step === 0) return Boolean(form.name.trim());
  if (step === 1) {
    return Boolean(
      form.adminFirstName.trim() &&
        form.adminLastName.trim() &&
        form.adminEmail.trim() &&
        form.adminPassword.length >= 8,
    );
  }
  return true;
}
