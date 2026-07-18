'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../../lib/api/client';
import { ALL_TIMEZONES, COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from '../../../lib/constants/locale-data';
import {
  usePlatformTenant,
  usePlatformTenantDids,
  useResumeOnboardTenant,
  useUploadTenantLogo,
} from '../../../lib/hooks/queries/use-platform';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { SlideOver } from '../../ui/SlideOver';

const STEPS = [
  'Company',
  'Location',
  'Administrator',
  'Business',
  'Extensions',
  'Assign DIDs',
  'Review',
] as const;

type SetupForm = {
  displayName: string;
  logoUrl: string;
  logoPreview: string;
  website: string;
  businessEmail: string;
  businessPhone: string;
  timezone: string;
  language: string;
  country: string;
  address: string;
  city: string;
  state: string;
  siteName: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  requirePasswordChange: boolean;
  businessHours: string;
  holidayCalendar: string;
  emergencyNumber: string;
  defaultCallerId: string;
  extensionCount: string;
  extensionStart: string;
  autoNumbering: boolean;
  selectedDidIds: string[];
};

const defaultForm = (): SetupForm => ({
  displayName: '',
  logoUrl: '',
  logoPreview: '',
  website: '',
  businessEmail: '',
  businessPhone: '',
  timezone: 'America/New_York',
  language: 'en',
  country: 'US',
  address: '',
  city: '',
  state: '',
  siteName: 'Main Office',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  adminPassword: '',
  adminPasswordConfirm: '',
  requirePasswordChange: true,
  businessHours: 'Mon-Fri 9:00-17:00',
  holidayCalendar: '',
  emergencyNumber: '911',
  defaultCallerId: '',
  extensionCount: '5',
  extensionStart: '100',
  autoNumbering: true,
  selectedDidIds: [],
});

export function TenantSetupWizard({
  open,
  tenantId,
  onClose,
}: {
  open: boolean;
  tenantId: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SetupForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeOnboard = useResumeOnboardTenant();
  const uploadLogo = useUploadTenantLogo();
  const tenantQuery = usePlatformTenant(tenantId ?? '');
  const didsQuery = usePlatformTenantDids(open ? tenantId : null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErrors({});
    setError(null);
    setSuccess(false);
    setForm(defaultForm());
  }, [open, tenantId]);

  useEffect(() => {
    if (!open || !tenantQuery.data) return;
    const t = tenantQuery.data;
    setForm((prev) => ({
      ...prev,
      displayName: t.displayName || t.name,
    }));
  }, [open, tenantQuery.data]);

  const patch = (partial: Partial<SetupForm>) => setForm((prev) => ({ ...prev, ...partial }));

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0 && !form.displayName.trim()) e.displayName = 'Company name is required';
    if (s === 1 && !form.siteName.trim()) e.siteName = 'Site name is required';
    if (s === 2) {
      if (!form.adminFirstName.trim()) e.adminFirstName = 'Required';
      if (!form.adminLastName.trim()) e.adminLastName = 'Required';
      if (!form.adminEmail.trim()) e.adminEmail = 'Email is required';
      if (!form.adminPassword || form.adminPassword.length < 8) e.adminPassword = 'Minimum 8 characters';
      if (form.adminPassword !== form.adminPasswordConfirm) e.adminPasswordConfirm = 'Passwords do not match';
    }
    return e;
  };

  const goNext = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const onLogoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const blobPreview = URL.createObjectURL(file);
    patch({ logoPreview: blobPreview });
    try {
      const result = await uploadLogo.mutateAsync(file);
      patch({ logoUrl: result.logoUrl, logoPreview: `${API_BASE}${result.previewUrl}` });
    } catch (err) {
      patch({ logoUrl: '', logoPreview: '' });
      setError(err instanceof Error ? err.message : 'Logo upload failed');
    }
  };

  const submit = async () => {
    if (!tenantId) return;
    for (let s = 0; s <= 2; s += 1) {
      const e = validateStep(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    setError(null);
    try {
      await resumeOnboard.mutateAsync({
        id: tenantId,
        payload: {
          displayName: form.displayName.trim(),
          businessEmail: form.businessEmail.trim() || undefined,
          businessPhone: form.businessPhone.trim() || undefined,
          website: form.website.trim() || undefined,
          timezone: form.timezone,
          defaultLanguage: form.language,
          logoUrl: form.logoUrl || undefined,
          siteName: form.siteName.trim(),
          businessHours: form.businessHours.trim() || undefined,
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
          adminFirstName: form.adminFirstName.trim(),
          adminLastName: form.adminLastName.trim(),
          country: form.country,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          emergencyNumber: form.emergencyNumber.trim() || undefined,
          defaultCallerId: form.defaultCallerId.trim() || undefined,
          requirePasswordChange: form.requirePasswordChange,
          extensionCount: Number(form.extensionCount) || 0,
          extensionStart: form.extensionStart.trim() || '100',
          selectedDidIds: form.selectedDidIds,
          holidayCalendar: form.holidayCalendar.trim() || undefined,
        },
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    }
  };

  const close = () => {
    setStep(0);
    setForm(defaultForm());
    setSuccess(false);
    onClose();
  };

  const countryOptions = useMemo(
    () => COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
    [],
  );
  const dids = didsQuery.data ?? [];

  return (
    <SlideOver
      open={open}
      onClose={close}
      title="Tenant Setup Wizard"
      description="Complete re-onboarding after Reset Tenant. Existing DIDs stay on this tenant."
      width="xl"
      footer={
        success ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => (step > 0 ? setStep(step - 1) : close())}>
              {step > 0 ? 'Back' : 'Cancel'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={goNext}>Continue</Button>
            ) : (
              <Button onClick={() => void submit()} disabled={resumeOnboard.isPending || uploadLogo.isPending}>
                {resumeOnboard.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Finishing…
                  </>
                ) : (
                  'Finish Setup'
                )}
              </Button>
            )}
          </div>
        )
      }
    >
      {success ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <h3 className="text-xl font-semibold">Tenant Setup Complete</h3>
          <p className="text-muted-foreground">
            {form.displayName} is active again. Assign any remaining DIDs from Phone Numbers if needed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  i < step
                    ? 'bg-primary/20 text-primary'
                    : i === step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}. {label}
              </div>
            ))}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company Name" required error={errors.displayName}>
                <Input value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => patch({ website: e.target.value })} />
              </Field>
              <Field label="Support Email">
                <Input type="email" value={form.businessEmail} onChange={(e) => patch({ businessEmail: e.target.value })} />
              </Field>
              <Field label="Business Phone">
                <Input value={form.businessPhone} onChange={(e) => patch({ businessPhone: e.target.value })} />
              </Field>
              <Field label="Timezone">
                <SearchableSelect value={form.timezone} onChange={(v) => patch({ timezone: v })} options={ALL_TIMEZONES} />
              </Field>
              <Field label="Language">
                <SearchableSelect value={form.language} onChange={(v) => patch({ language: v })} options={LANGUAGE_OPTIONS} />
              </Field>
              <Field label="Country">
                <SearchableSelect value={form.country} onChange={(v) => patch({ country: v })} options={countryOptions} />
              </Field>
              <Field label="Logo" className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-4">
                  {form.logoPreview ? (
                    <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.logoPreview} alt="Logo" className="h-full w-full object-contain" />
                      <button type="button" className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5" onClick={() => patch({ logoUrl: '', logoPreview: '' })}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed">
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onLogoSelected(e)} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Upload logo
                  </Button>
                </div>
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site Name" required error={errors.siteName} className="sm:col-span-2">
                <Input value={form.siteName} onChange={(e) => patch({ siteName: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => patch({ address: e.target.value })} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => patch({ city: e.target.value })} />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => patch({ state: e.target.value })} />
              </Field>
              <Field label="Country">
                <SearchableSelect value={form.country} onChange={(v) => patch({ country: v })} options={countryOptions} />
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" required error={errors.adminFirstName}>
                <Input value={form.adminFirstName} onChange={(e) => patch({ adminFirstName: e.target.value })} />
              </Field>
              <Field label="Last name" required error={errors.adminLastName}>
                <Input value={form.adminLastName} onChange={(e) => patch({ adminLastName: e.target.value })} />
              </Field>
              <Field label="Email" required error={errors.adminEmail} className="sm:col-span-2">
                <Input type="email" value={form.adminEmail} onChange={(e) => patch({ adminEmail: e.target.value })} />
              </Field>
              <Field label="Temporary Password" required error={errors.adminPassword}>
                <Input type="password" value={form.adminPassword} onChange={(e) => patch({ adminPassword: e.target.value })} />
              </Field>
              <Field label="Confirm Password" required error={errors.adminPasswordConfirm}>
                <Input type="password" value={form.adminPasswordConfirm} onChange={(e) => patch({ adminPasswordConfirm: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.requirePasswordChange}
                  onChange={(e) => patch({ requirePasswordChange: e.target.checked })}
                />
                Require password change on first login
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business Hours" className="sm:col-span-2">
                <Input value={form.businessHours} onChange={(e) => patch({ businessHours: e.target.value })} />
              </Field>
              <Field label="Holiday Calendar" className="sm:col-span-2">
                <Input
                  value={form.holidayCalendar}
                  onChange={(e) => patch({ holidayCalendar: e.target.value })}
                  placeholder="e.g. US Federal Holidays"
                />
              </Field>
              <Field label="Emergency Number">
                <Input value={form.emergencyNumber} onChange={(e) => patch({ emergencyNumber: e.target.value })} />
              </Field>
              <Field label="Default Caller ID">
                <Input value={form.defaultCallerId} onChange={(e) => patch({ defaultCallerId: e.target.value })} placeholder="+1…" />
              </Field>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Create extensions (count)">
                <Input value={form.extensionCount} onChange={(e) => patch({ extensionCount: e.target.value })} />
              </Field>
              <Field label="Starting number">
                <Input value={form.extensionStart} onChange={(e) => patch({ extensionStart: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.autoNumbering} onChange={(e) => patch({ autoNumbering: e.target.checked })} />
                Auto numbering
              </label>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Import users can be completed later from Users. Extensions are created after Finish when count &gt; 0.
              </p>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                All tenant-owned numbers. Select DIDs to mark as ready for assignment after setup (status stays UNASSIGNED until bound to an extension).
              </p>
              {didsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading numbers…</p>
              ) : dids.length === 0 ? (
                <p className="text-sm text-muted-foreground">No DIDs owned by this tenant.</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {dids.map((d) => {
                    const checked = form.selectedDidIds.includes(d.id);
                    const assigned = Boolean(d.lineId);
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              patch({
                                selectedDidIds: e.target.checked
                                  ? [...form.selectedDidIds, d.id]
                                  : form.selectedDidIds.filter((id) => id !== d.id),
                              });
                            }}
                          />
                          <span className="font-mono">{d.number}</span>
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {assigned ? 'Assigned' : d.status === 'UNASSIGNED' || d.available ? 'Unassigned' : d.status}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <p className="font-semibold">Review</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <Summary label="Company" value={form.displayName} />
                <Summary label="Location" value={`${form.siteName} · ${form.city || form.country}`} />
                <Summary label="Admin" value={`${form.adminFirstName} ${form.adminLastName} (${form.adminEmail})`} />
                <Summary label="Business Hours" value={form.businessHours || '—'} />
                <Summary label="Extensions" value={`${form.extensionCount} from ${form.extensionStart}`} />
                <Summary label="Numbers selected" value={String(form.selectedDidIds.length)} />
                <Summary label="Emergency" value={form.emergencyNumber || '—'} />
                <Summary label="Default Caller ID" value={form.defaultCallerId || '—'} />
              </dl>
            </div>
          ) : null}
        </div>
      )}
    </SlideOver>
  );
}

function Field({
  label,
  children,
  required,
  error,
  className,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 text-sm ${className ?? ''}`}>
      <span className="font-medium">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
