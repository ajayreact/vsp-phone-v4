'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../../lib/api/client';
import {
  ALL_TIMEZONES,
  BILLING_CYCLE_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  PLAN_LIMIT_DEFAULTS,
  RESERVED_SLUGS,
  SITE_PRESETS,
  countryByCode,
  slugFromDisplayName,
} from '../../../lib/constants/locale-data';
import {
  useOnboardTenant,
  usePlatformPlans,
  usePlatformTenant,
  usePlatformTenantDids,
  useResumeOnboardTenant,
  useUploadTenantLogo,
} from '../../../lib/hooks/queries/use-platform';
import type { OnboardTenantPayload } from '../../../lib/repositories/platform.repository';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { SlideOver } from '../../ui/SlideOver';

const DRAFT_KEY = 'vsp-tenant-onboard-draft';

export type OnboardingFormState = {
  name: string;
  displayName: string;
  slug: string;
  slugManual: boolean;
  businessEmail: string;
  businessPhone: string;
  website: string;
  industry: string;
  companySize: string;
  logoUrl: string;
  logoPreview: string;
  timezone: string;
  country: string;
  state: string;
  city: string;
  address: string;
  postalCode: string;
  currency: string;
  language: string;
  status: 'ACTIVE' | 'PENDING';
  sitePreset: string;
  siteName: string;
  siteCountry: string;
  siteTimezone: string;
  siteAddress: string;
  siteLocationCode: string;
  siteDescription: string;
  businessHours: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  adminMobile: string;
  adminJobTitle: string;
  adminDepartment: string;
  adminLanguage: string;
  adminTimezone: string;
  voicemailEnabled: boolean;
  recordingEnabled: boolean;
  musicOnHold: boolean;
  planId: string;
  trial: boolean;
  billingCycle: string;
  maxExtensions: string;
  maxUsers: string;
  maxNumbers: string;
  storageLimitGb: string;
  recordingRetentionDays: string;
};

const defaultForm = (): OnboardingFormState => ({
  name: '',
  displayName: '',
  slug: '',
  slugManual: false,
  businessEmail: '',
  businessPhone: '',
  website: '',
  industry: '',
  companySize: '',
  logoUrl: '',
  logoPreview: '',
  timezone: 'America/New_York',
  country: 'US',
  state: '',
  city: '',
  address: '',
  postalCode: '',
  currency: 'USD',
  language: 'en',
  status: 'ACTIVE',
  sitePreset: 'Main Office',
  siteName: 'Main Office',
  siteCountry: 'US',
  siteTimezone: 'America/New_York',
  siteAddress: '',
  siteLocationCode: '',
  siteDescription: '',
  businessHours: 'Mon-Fri 9:00-17:00',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  adminUsername: '',
  adminPassword: '',
  adminPasswordConfirm: '',
  adminMobile: '',
  adminJobTitle: '',
  adminDepartment: '',
  adminLanguage: 'en',
  adminTimezone: 'America/New_York',
  voicemailEnabled: true,
  recordingEnabled: false,
  musicOnHold: true,
  planId: '',
  trial: true,
  billingCycle: 'monthly',
  maxExtensions: '20',
  maxUsers: '10',
  maxNumbers: '5',
  storageLimitGb: '25',
  recordingRetentionDays: '30',
});

const FULL_STEPS = ['Organization', 'Site', 'Admin User', 'Plan & Features', 'Review'] as const;
const RESUME_STEPS = ['Company', 'Site & Hours', 'Admin', 'DIDs & Finish'] as const;

export function TenantOnboardingWizard({
  open,
  onClose,
  resumeTenantId = null,
}: {
  open: boolean;
  onClose: () => void;
  /** When set, completes Factory Reset onboarding for an existing PENDING tenant. */
  resumeTenantId?: string | null;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingFormState>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tenantName: string; publicId: string; slug: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onboard = useOnboardTenant();
  const resumeOnboard = useResumeOnboardTenant();
  const uploadLogo = useUploadTenantLogo();
  const plansQuery = usePlatformPlans();
  const isResume = Boolean(resumeTenantId);
  const steps = isResume ? RESUME_STEPS : FULL_STEPS;
  const lastStep = steps.length - 1;
  const resumeTenant = usePlatformTenant(resumeTenantId ?? '');
  const resumeDids = usePlatformTenantDids(isResume && open ? resumeTenantId : null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErrors({});
    setError(null);
    setSuccess(null);
    if (isResume) {
      setForm(defaultForm());
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setForm({ ...defaultForm(), ...JSON.parse(raw) });
      else setForm(defaultForm());
    } catch {
      setForm(defaultForm());
    }
  }, [open, isResume]);

  useEffect(() => {
    if (!open || !isResume || !resumeTenant.data) return;
    const t = resumeTenant.data;
    setForm((prev) => ({
      ...prev,
      name: t.name,
      displayName: t.displayName || t.name,
      slug: t.slug,
      slugManual: true,
      status: 'PENDING',
    }));
  }, [open, isResume, resumeTenant.data]);

  useEffect(() => {
    if (isResume) return;
    const plans = plansQuery.data;
    if (!plans?.length || form.planId) return;
    const starter = plans.find((p) => p.name === 'Starter') ?? plans[0];
    applyPlanDefaults(starter.id, starter.name, starter.seatLimit, starter.didLimit);
  }, [plansQuery.data, form.planId, isResume]);

  const patch = useCallback((partial: Partial<OnboardingFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (!next.slugManual && partial.name !== undefined) {
        next.slug = slugFromDisplayName(next.name);
      }
      return next;
    });
  }, []);

  const applyCountryDefaults = (countryCode: string) => {
    const c = countryByCode(countryCode);
    if (!c) return;
    patch({
      country: countryCode,
      timezone: c.timezone,
      currency: c.currency,
      language: c.language,
      adminTimezone: c.timezone,
      siteCountry: countryCode,
      siteTimezone: c.timezone,
    });
  };

  const applyPlanDefaults = (planId: string, planName: string, seatLimit: number, didLimit: number) => {
    const limits = PLAN_LIMIT_DEFAULTS[planName] ?? { storageLimitGb: 50, recordingRetentionDays: 90 };
    patch({
      planId,
      maxUsers: String(seatLimit),
      maxNumbers: String(didLimit),
      maxExtensions: String(seatLimit * 2),
      storageLimitGb: String(limits.storageLimitGb),
      recordingRetentionDays: String(limits.recordingRetentionDays),
    });
  };

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  };

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!form.name.trim()) e.name = 'Organization name is required';
      if (!isResume) {
        if (RESERVED_SLUGS.has(form.slug)) e.slug = 'This slug is reserved';
        if (!form.slug.trim()) e.slug = 'Slug is required';
      }
    }
    if (s === 1) {
      if (!form.siteName.trim()) e.siteName = 'Site name is required';
    }
    if (s === 2) {
      if (!form.adminFirstName.trim()) e.adminFirstName = 'Required';
      if (!form.adminLastName.trim()) e.adminLastName = 'Required';
      if (!form.adminEmail.trim()) e.adminEmail = 'Email is required';
      if (!form.adminPassword || form.adminPassword.length < 8) e.adminPassword = 'Minimum 8 characters';
      if (form.adminPassword !== form.adminPasswordConfirm) e.adminPasswordConfirm = 'Passwords do not match';
    }
    if (!isResume && s === 3) {
      if (!form.planId) e.planId = 'Select a billing plan';
    }
    return e;
  };

  const goNext = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(s + 1, lastStep));
  };

  const onLogoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const blobPreview = URL.createObjectURL(file);
    patch({ logoPreview: blobPreview });
    setError(null);

    try {
      const result = await uploadLogo.mutateAsync(file);
      patch({
        logoUrl: result.logoUrl,
        logoPreview: `${API_BASE}${result.previewUrl}`,
      });
    } catch (err) {
      patch({ logoUrl: '', logoPreview: '' });
      setError(err instanceof Error ? err.message : 'Logo upload failed');
    }
  };

  const clearLogo = () => {
    patch({ logoUrl: '', logoPreview: '' });
  };

  const submit = async () => {
    const maxValidate = isResume ? 2 : 3;
    for (let s = 0; s <= maxValidate; s += 1) {
      const e = validateStep(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }

    setError(null);
    const payload: OnboardTenantPayload = {
      name: form.name.trim(),
      displayName: form.displayName.trim() || form.name.trim(),
      slug: form.slug.trim(),
      businessEmail: form.businessEmail.trim() || undefined,
      businessPhone: form.businessPhone.trim() || undefined,
      website: form.website.trim() || undefined,
      industry: form.industry || undefined,
      companySize: form.companySize || undefined,
      logoUrl: form.logoUrl || undefined,
      timezone: form.timezone,
      country: form.country,
      state: form.state.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
      currency: form.currency,
      defaultLanguage: form.language,
      status: form.status,
      siteName: form.siteName.trim(),
      siteCountry: form.siteCountry,
      siteTimezone: form.siteTimezone,
      siteAddress: form.siteAddress.trim() || form.address.trim() || undefined,
      siteLocationCode: form.siteLocationCode.trim() || undefined,
      siteDescription: form.siteDescription.trim() || undefined,
      businessHours: form.businessHours.trim() || undefined,
      adminEmail: form.adminEmail.trim(),
      adminPassword: form.adminPassword,
      adminFirstName: form.adminFirstName.trim(),
      adminLastName: form.adminLastName.trim(),
      adminUsername: form.adminUsername.trim() || undefined,
      adminMobile: form.adminMobile.trim() || undefined,
      adminJobTitle: form.adminJobTitle.trim() || undefined,
      adminDepartment: form.adminDepartment.trim() || undefined,
      adminLanguage: form.adminLanguage,
      adminTimezone: form.adminTimezone,
      voicemailEnabled: form.voicemailEnabled,
      recordingEnabled: form.recordingEnabled,
      musicOnHold: form.musicOnHold,
      planId: form.planId,
      trial: form.trial,
      billingCycle: form.billingCycle,
      maxExtensions: Number(form.maxExtensions) || undefined,
      maxUsers: Number(form.maxUsers) || undefined,
      maxNumbers: Number(form.maxNumbers) || undefined,
      storageLimitGb: Number(form.storageLimitGb) || undefined,
      recordingRetentionDays: Number(form.recordingRetentionDays) || undefined,
    };

    try {
      if (isResume && resumeTenantId) {
        const result = await resumeOnboard.mutateAsync({
          id: resumeTenantId,
          payload: {
            displayName: payload.displayName,
            businessEmail: payload.businessEmail,
            businessPhone: payload.businessPhone,
            website: payload.website,
            timezone: payload.timezone,
            defaultLanguage: payload.defaultLanguage,
            logoUrl: payload.logoUrl,
            siteName: payload.siteName,
            businessHours: payload.businessHours,
            adminEmail: payload.adminEmail,
            adminPassword: payload.adminPassword,
            adminFirstName: payload.adminFirstName,
            adminLastName: payload.adminLastName,
          },
        });
        localStorage.removeItem(DRAFT_KEY);
        setSuccess({
          tenantName: result.tenant.displayName || result.tenant.name,
          publicId: result.tenant.publicId,
          slug: result.tenant.slug,
        });
        return;
      }

      const result = await onboard.mutateAsync(payload);
      localStorage.removeItem(DRAFT_KEY);
      setSuccess({
        tenantName: result.tenant.displayName || result.tenant.name,
        publicId: result.tenant.publicId,
        slug: result.tenant.slug,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding failed');
    }
  };

  const close = () => {
    setStep(0);
    setForm(defaultForm());
    setErrors({});
    setError(null);
    setSuccess(null);
    onClose();
  };

  const countryOptions = useMemo(
    () => COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
    [],
  );

  const timezoneOptions = useMemo(() => ALL_TIMEZONES, []);
  const siteOptions = useMemo(() => SITE_PRESETS.map((s) => ({ value: s, label: s })), []);
  const planOptions = useMemo(
    () =>
      (plansQuery.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.name} — $${(p.priceCents / 100).toFixed(2)}/mo`,
        meta: p,
      })),
    [plansQuery.data],
  );

  const selectedPlanLabel = planOptions.find((p) => p.value === form.planId)?.label ?? '—';

  return (
    <SlideOver
      open={open}
      onClose={close}
      title={isResume ? 'Resume Tenant Onboarding' : 'Enterprise Tenant Onboarding'}
      description={
        isResume
          ? 'Complete company profile and Tenant Admin after Factory Reset. Existing DIDs stay on this tenant.'
          : 'Provision organization, site, admin user, subscription, and platform features.'
      }
      width="xl"
      footer={
        success ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => (step > 0 ? setStep(step - 1) : close())}>
                {step > 0 ? 'Back' : 'Cancel'}
              </Button>
              {!isResume ? (
                <Button variant="ghost" onClick={saveDraft}>
                  Save Draft
                </Button>
              ) : null}
            </div>
            {step < lastStep ? (
              <Button onClick={goNext}>Continue</Button>
            ) : (
              <Button
                onClick={() => void submit()}
                disabled={onboard.isPending || resumeOnboard.isPending || uploadLogo.isPending}
              >
                {onboard.isPending || resumeOnboard.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : isResume ? (
                  'Finish Onboarding'
                ) : (
                  'Create Tenant'
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
          <h3 className="text-xl font-semibold">{isResume ? 'Onboarding Complete' : 'Tenant Created'}</h3>
          <p className="text-muted-foreground">
            {success.tenantName} ({success.publicId}) is ready at{' '}
            <span className="font-medium">{success.slug}.vspphone.com</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            {isResume
              ? 'Tenant Admin and site were recreated. Assign existing DIDs to extensions from the tenant portal.'
              : 'Subscription, billing account, RBAC, site, and admin user were provisioned.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <WizardProgress step={step} steps={steps} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization name" required error={errors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  readOnly={isResume}
                  className={isResume ? 'bg-muted/40' : undefined}
                />
              </Field>
              <Field label="Display name">
                <Input value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
              </Field>
              <Field label="Slug" required={!isResume} error={errors.slug}>
                <Input
                  value={form.slug}
                  onChange={(e) => patch({ slug: e.target.value, slugManual: true })}
                  readOnly={isResume}
                  className={isResume ? 'bg-muted/40' : undefined}
                />
              </Field>
              {!isResume ? (
              <Field label="Status">
                <SearchableSelect
                  value={form.status}
                  onChange={(v) => patch({ status: v as 'ACTIVE' | 'PENDING' })}
                  options={[
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'PENDING', label: 'Pending' },
                  ]}
                />
              </Field>
              ) : (
                <Field label="Status">
                  <Input value="PENDING (resume after Factory Reset)" readOnly className="bg-muted/40" />
                </Field>
              )}
              <Field label="Logo" className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-4">
                  {form.logoPreview ? (
                    <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 shadow"
                        onClick={clearLogo}
                        aria-label="Remove logo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={(e) => void onLogoSelected(e)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadLogo.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadLogo.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                        </>
                      ) : (
                        'Upload logo'
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, GIF, or SVG up to 2 MB</p>
                  </div>
                </div>
              </Field>
              <Field label="Country" className="sm:col-span-2">
                <SearchableSelect value={form.country} onChange={applyCountryDefaults} options={countryOptions} />
              </Field>
              <Field label="Timezone">
                <SearchableSelect value={form.timezone} onChange={(v) => patch({ timezone: v })} options={timezoneOptions} />
              </Field>
              <Field label="Currency">
                <Input value={form.currency} onChange={(e) => patch({ currency: e.target.value })} />
              </Field>
              <Field label="Business email">
                <Input type="email" value={form.businessEmail} onChange={(e) => patch({ businessEmail: e.target.value })} />
              </Field>
              <Field label="Business phone">
                <Input value={form.businessPhone} onChange={(e) => patch({ businessPhone: e.target.value })} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => patch({ website: e.target.value })} />
              </Field>
              <Field label="Industry">
                <SearchableSelect
                  value={form.industry}
                  onChange={(v) => patch({ industry: v })}
                  options={INDUSTRY_OPTIONS.map((i) => ({ value: i, label: i }))}
                  placeholder="Select industry"
                />
              </Field>
              <Field label="Company size">
                <SearchableSelect
                  value={form.companySize}
                  onChange={(v) => patch({ companySize: v })}
                  options={COMPANY_SIZE_OPTIONS.map((s) => ({ value: s, label: s }))}
                  placeholder="Select size"
                />
              </Field>
              <Field label="Language">
                <SearchableSelect
                  value={form.language}
                  onChange={(v) => patch({ language: v })}
                  options={LANGUAGE_OPTIONS}
                />
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
              <Field label="Postal code">
                <Input value={form.postalCode} onChange={(e) => patch({ postalCode: e.target.value })} />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site template" className="sm:col-span-2">
                <SearchableSelect
                  value={form.sitePreset}
                  onChange={(v) => {
                    if (v === 'Custom Site') {
                      patch({ sitePreset: v, siteName: '' });
                    } else {
                      patch({ sitePreset: v, siteName: v });
                    }
                  }}
                  options={siteOptions}
                />
              </Field>
              {form.sitePreset === 'Custom Site' ? (
                <Field label="Custom site name" required error={errors.siteName} className="sm:col-span-2">
                  <Input value={form.siteName} onChange={(e) => patch({ siteName: e.target.value })} />
                </Field>
              ) : (
                <Field label="Site name" className="sm:col-span-2">
                  <Input value={form.siteName} readOnly className="bg-muted/40" />
                </Field>
              )}
              <Field label="Country">
                <SearchableSelect value={form.siteCountry} onChange={(v) => patch({ siteCountry: v })} options={countryOptions} />
              </Field>
              <Field label="Timezone">
                <SearchableSelect value={form.siteTimezone} onChange={(v) => patch({ siteTimezone: v })} options={timezoneOptions} />
              </Field>
              <Field label="Location code">
                <Input value={form.siteLocationCode} onChange={(e) => patch({ siteLocationCode: e.target.value })} placeholder="HQ-01" />
              </Field>
              <Field label="Business hours">
                <Input value={form.businessHours} onChange={(e) => patch({ businessHours: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.siteAddress} onChange={(e) => patch({ siteAddress: e.target.value })} />
              </Field>
              <Field label="Site description" className="sm:col-span-2">
                <Input value={form.siteDescription} onChange={(e) => patch({ siteDescription: e.target.value })} />
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
              <Field label="Email" required error={errors.adminEmail}>
                <Input type="email" value={form.adminEmail} onChange={(e) => patch({ adminEmail: e.target.value })} />
              </Field>
              <Field label="Username">
                <Input value={form.adminUsername} onChange={(e) => patch({ adminUsername: e.target.value })} />
              </Field>
              <Field label="Password" required error={errors.adminPassword}>
                <Input type="password" value={form.adminPassword} onChange={(e) => patch({ adminPassword: e.target.value })} />
              </Field>
              <Field label="Confirm password" required error={errors.adminPasswordConfirm}>
                <Input type="password" value={form.adminPasswordConfirm} onChange={(e) => patch({ adminPasswordConfirm: e.target.value })} />
              </Field>
              <Field label="Mobile">
                <Input value={form.adminMobile} onChange={(e) => patch({ adminMobile: e.target.value })} />
              </Field>
              <Field label="Job title">
                <Input value={form.adminJobTitle} onChange={(e) => patch({ adminJobTitle: e.target.value })} />
              </Field>
              <Field label="Department">
                <Input value={form.adminDepartment} onChange={(e) => patch({ adminDepartment: e.target.value })} />
              </Field>
              <Field label="Language">
                <SearchableSelect value={form.adminLanguage} onChange={(v) => patch({ adminLanguage: v })} options={LANGUAGE_OPTIONS} />
              </Field>
              <Field label="Timezone">
                <SearchableSelect value={form.adminTimezone} onChange={(v) => patch({ adminTimezone: v })} options={timezoneOptions} />
              </Field>
            </div>
          ) : null}

          {!isResume && step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Plan" required error={errors.planId} className="sm:col-span-2">
                <SearchableSelect
                  value={form.planId}
                  onChange={(v) => {
                    const plan = plansQuery.data?.find((p) => p.id === v);
                    if (plan) applyPlanDefaults(plan.id, plan.name, plan.seatLimit, plan.didLimit);
                    else patch({ planId: v });
                  }}
                  options={planOptions}
                  placeholder={plansQuery.isLoading ? 'Loading plans…' : 'Select plan'}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.trial} onChange={(e) => patch({ trial: e.target.checked })} />
                Start as trial (same plan, trial billing status)
              </label>
              <Field label="Billing cycle">
                <SearchableSelect
                  value={form.billingCycle}
                  onChange={(v) => patch({ billingCycle: v })}
                  options={BILLING_CYCLE_OPTIONS.map((b) => ({ value: b, label: b }))}
                />
              </Field>
              <Field label="Max extensions">
                <Input value={form.maxExtensions} onChange={(e) => patch({ maxExtensions: e.target.value })} />
              </Field>
              <Field label="Max users">
                <Input value={form.maxUsers} onChange={(e) => patch({ maxUsers: e.target.value })} />
              </Field>
              <Field label="Max numbers">
                <Input value={form.maxNumbers} onChange={(e) => patch({ maxNumbers: e.target.value })} />
              </Field>
              <Field label="Storage limit (GB)">
                <Input value={form.storageLimitGb} onChange={(e) => patch({ storageLimitGb: e.target.value })} />
              </Field>
              <Field label="Recording retention (days)">
                <Input value={form.recordingRetentionDays} onChange={(e) => patch({ recordingRetentionDays: e.target.value })} />
              </Field>
              <p className="text-sm font-medium sm:col-span-2">Platform features</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.voicemailEnabled} onChange={(e) => patch({ voicemailEnabled: e.target.checked })} />
                Voicemail enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.recordingEnabled} onChange={(e) => patch({ recordingEnabled: e.target.checked })} />
                Recording enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.musicOnHold} onChange={(e) => patch({ musicOnHold: e.target.checked })} />
                Music on hold
              </label>
            </div>
          ) : null}

          {isResume && step === 3 ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
                <p className="font-semibold">Review &amp; finish</p>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <SummaryItem label="Organization" value={form.displayName || form.name} />
                  <SummaryItem label="Slug" value={`${form.slug}.vspphone.com`} />
                  <SummaryItem label="Country / TZ" value={`${form.country} · ${form.timezone}`} />
                  <SummaryItem label="Site" value={form.siteName} />
                  <SummaryItem label="Admin" value={`${form.adminFirstName} ${form.adminLastName} (${form.adminEmail})`} />
                  <SummaryItem label="Logo" value={form.logoUrl ? 'Uploaded' : 'None'} />
                </dl>
              </div>
              <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
                <p className="font-semibold">Existing DIDs on this tenant</p>
                <p className="text-muted-foreground">
                  Factory Reset keeps DID ownership. Numbers below stay on this tenant (typically UNASSIGNED). Assign
                  them to extensions after finish from the tenant portal → Phone Numbers.
                </p>
                {resumeDids.isLoading ? (
                  <p className="text-muted-foreground">Loading DIDs…</p>
                ) : (resumeDids.data?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground">No DIDs currently owned by this tenant.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {resumeDids.data!.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="font-mono">{d.number}</span>
                        <span className="text-xs text-muted-foreground">
                          {d.status}
                          {d.available ? ' · available' : ''}
                          {d.lineId ? ' · bound' : ' · unassigned'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {!isResume && step === 4 ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <p className="font-semibold">Review &amp; Create</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <SummaryItem label="Organization" value={form.displayName || form.name} />
                <SummaryItem label="Slug" value={`${form.slug}.vspphone.com`} />
                <SummaryItem label="Country / TZ" value={`${form.country} · ${form.timezone}`} />
                <SummaryItem label="Site" value={form.siteName} />
                <SummaryItem label="Admin" value={`${form.adminFirstName} ${form.adminLastName} (${form.adminEmail})`} />
                <SummaryItem label="Plan" value={selectedPlanLabel} />
                <SummaryItem label="Subscription" value={form.trial ? 'Trial' : 'Active'} />
                <SummaryItem label="Logo" value={form.logoUrl ? 'Uploaded' : 'None'} />
              </dl>
            </div>
          ) : null}
        </div>
      )}
    </SlideOver>
  );
}

function WizardProgress({ step, steps }: { step: number; steps: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((label, i) => (
        <div
          key={label}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            i < step ? 'bg-primary/20 text-primary' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {i + 1}. {label}
        </div>
      ))}
    </div>
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
      <span className="font-medium">{label}{required ? ' *' : ''}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
