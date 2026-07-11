'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { usePortal } from '../../lib/portal/PortalProvider';
import {
  usePlatformDashboard,
  usePlatformSettings,
  useUpdatePlatformSettings,
} from '../../lib/hooks/queries/use-platform';
import { useAuth } from '../../lib/auth/AuthProvider';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { Badge } from '../ui/Badge';

export function SettingsContent() {
  const portal = usePortal();
  const { session } = useAuth();
  const platformDashboard = usePlatformDashboard();
  const settingsQuery = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const [form, setForm] = useState({
    platformName: '',
    supportEmail: '',
    defaultTimezone: '',
    smtpHost: '',
    smtpPort: '',
    smtpUsername: '',
    smtpFromEmail: '',
    smtpUseTls: true,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        platformName: settingsQuery.data.platformName,
        supportEmail: settingsQuery.data.supportEmail,
        defaultTimezone: settingsQuery.data.defaultTimezone,
        smtpHost: settingsQuery.data.smtpHost ?? '',
        smtpPort: settingsQuery.data.smtpPort?.toString() ?? '587',
        smtpUsername: settingsQuery.data.smtpUsername ?? '',
        smtpFromEmail: settingsQuery.data.smtpFromEmail ?? '',
        smtpUseTls: settingsQuery.data.smtpUseTls,
      });
    }
  }, [settingsQuery.data]);

  const savePlatformSettings = async () => {
    setSaved(false);
    await updateSettings.mutateAsync({
      platformName: form.platformName,
      supportEmail: form.supportEmail,
      defaultTimezone: form.defaultTimezone,
      smtpHost: form.smtpHost || null,
      smtpPort: form.smtpPort ? Number(form.smtpPort) : null,
      smtpUsername: form.smtpUsername || null,
      smtpFromEmail: form.smtpFromEmail || null,
      smtpUseTls: form.smtpUseTls,
    });
    setSaved(true);
  };

  return (
    <ModuleAccessGate moduleId="settings">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                portal === 'platform' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void platformDashboard.refetch()}
                    disabled={platformDashboard.isFetching}
                  >
                    <RefreshCw className={`h-4 w-4 ${platformDashboard.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                ) : null
              }
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader title="Session" description="Current authenticated user context." />
                <CardBody className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{session?.email ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{session?.userId ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tenant</span><span>{session?.tenant?.name ?? session?.tenantId ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Roles</span><span>{session?.roles.map((r) => r.name).join(', ') || '—'}</span></div>
                </CardBody>
              </Card>

              {portal === 'platform' ? (
                <>
                  <Card className="glass-card">
                    <CardHeader title="Platform Overview" description="Live metrics from platform dashboard." />
                    <CardBody>
                      <QueryState
                        isLoading={platformDashboard.isLoading}
                        isError={platformDashboard.isError}
                        error={platformDashboard.error}
                        onRetry={() => void platformDashboard.refetch()}
                        skeleton={<Skeleton className="h-32 w-full rounded-xl" />}
                      >
                        {platformDashboard.data ? (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div><p className="text-muted-foreground">Tenants</p><p className="text-lg font-semibold">{platformDashboard.data.totalTenants}</p></div>
                            <div><p className="text-muted-foreground">Extensions</p><p className="text-lg font-semibold">{platformDashboard.data.totalExtensions}</p></div>
                            <div><p className="text-muted-foreground">Active Alerts</p><p className="text-lg font-semibold">{platformDashboard.data.activeAlerts}</p></div>
                            <div><p className="text-muted-foreground">Telnyx Numbers</p><p className="text-lg font-semibold">{platformDashboard.data.telnyxInventory}</p></div>
                          </div>
                        ) : null}
                      </QueryState>
                    </CardBody>
                  </Card>

                  <Card className="glass-card lg:col-span-2">
                    <CardHeader
                      title="Platform Settings"
                      description="Global platform identity and defaults."
                      action={
                        settingsQuery.data?.smtpConfigured ? (
                          <Badge variant="outline">SMTP configured</Badge>
                        ) : (
                          <Badge variant="outline">SMTP not configured</Badge>
                        )
                      }
                    />
                    <CardBody>
                      <QueryState
                        isLoading={settingsQuery.isLoading}
                        isError={settingsQuery.isError}
                        error={settingsQuery.error}
                        onRetry={() => void settingsQuery.refetch()}
                        skeleton={<Skeleton className="h-48 w-full rounded-xl" />}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <SettingField label="Platform name" value={form.platformName} onChange={(v) => setForm({ ...form, platformName: v })} />
                          <SettingField label="Support email" value={form.supportEmail} onChange={(v) => setForm({ ...form, supportEmail: v })} />
                          <SettingField label="Default timezone" value={form.defaultTimezone} onChange={(v) => setForm({ ...form, defaultTimezone: v })} />
                        </div>
                      </QueryState>
                    </CardBody>
                  </Card>

                  <Card className="glass-card lg:col-span-2">
                    <CardHeader title="SMTP" description="Outbound email delivery configuration." />
                    <CardBody className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <SettingField label="SMTP host" value={form.smtpHost} onChange={(v) => setForm({ ...form, smtpHost: v })} />
                        <SettingField label="SMTP port" value={form.smtpPort} onChange={(v) => setForm({ ...form, smtpPort: v })} />
                        <SettingField label="Username" value={form.smtpUsername} onChange={(v) => setForm({ ...form, smtpUsername: v })} />
                        <SettingField label="From email" value={form.smtpFromEmail} onChange={(v) => setForm({ ...form, smtpFromEmail: v })} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.smtpUseTls}
                          onChange={(e) => setForm({ ...form, smtpUseTls: e.target.checked })}
                        />
                        Use TLS
                      </label>
                      <div className="flex items-center gap-3">
                        <Button onClick={() => void savePlatformSettings()} disabled={updateSettings.isPending}>
                          {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
                        </Button>
                        {saved ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
                      </div>
                    </CardBody>
                  </Card>
                </>
              ) : (
                <Card className="glass-card">
                  <CardHeader title="Portal" description="Tenant portal configuration." />
                  <CardBody className="text-sm text-muted-foreground">
                    <p>Portal type: <span className="font-medium text-foreground">{portal}</span></p>
                    <p className="mt-2">Tenant settings are managed through your organization profile and RBAC roles.</p>
                  </CardBody>
                </Card>
              )}
            </div>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}

function SettingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
