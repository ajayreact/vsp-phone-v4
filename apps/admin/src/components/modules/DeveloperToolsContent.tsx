'use client';

import { useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { isDeveloperModeEnvEnabled } from '../../lib/feature-flags';
import {
  useDeleteTenantConfirmed,
  usePlatformSettings,
  usePlatformTenants,
  useResetTenant,
  useResetTenantPbx,
  useUpdatePlatformSettings,
} from '../../lib/hooks/queries/use-platform';
import { httpPost } from '../../lib/api/http-client';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import {
  TenantLifecycleConfirmDialog,
  type LifecycleDialogKind,
} from './tenants/TenantLifecycleConfirmDialog';
import { TenantSetupWizard } from './tenants/TenantSetupWizard';

export function DeveloperToolsContent() {
  const permissions = usePermissions();
  const settings = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const tenants = usePlatformTenants();
  const [tenantId, setTenantId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    kind: LifecycleDialogKind;
    name: string;
  } | null>(null);

  const resetPbx = useResetTenantPbx();
  const resetTenant = useResetTenant();
  const deleteTenant = useDeleteTenantConfirmed();

  const isSuper = hasPermission(permissions, PERMISSIONS.PLATFORM_SUPER_ADMIN);
  const hasDevtools = hasPermission(permissions, PERMISSIONS.PLATFORM_DEVTOOLS);
  const developerMode = Boolean(settings.data?.developerMode) || isDeveloperModeEnvEnabled();
  const canUseTools = isSuper && hasDevtools && developerMode;
  const selected = (tenants.data ?? []).find((t) => t.id === tenantId);

  if (!isSuper || !hasDevtools) {
    return (
      <PageContainer>
        <PageHeader title="Developer Tools" description="Platform Super Admin + platform.devtools only." />
        <p className="text-sm text-muted-foreground">You do not have access to Developer Tools.</p>
      </PageContainer>
    );
  }

  if (!developerMode) {
    return (
      <PageContainer>
        <PageHeader
          title="Developer Tools"
          description="Requires Platform Super Admin, platform.devtools, and Developer Mode."
        />
        <p className="text-sm text-muted-foreground">
          Developer Mode is off. Enable it under Platform Settings, then return here.
        </p>
      </PageContainer>
    );
  }

  const runTool = async (path: string, body: Record<string, unknown> = {}) => {
    if (!tenantId) {
      setMsg('Select a tenant first');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await httpPost<{ data: unknown }>(`/v1/platform/dev-tools/tenants/${tenantId}/${path}`, body);
      setMsg(JSON.stringify(res.data ?? res, null, 2));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Developer Tools"
        description="Pilot utilities for Reset PBX, Reset Tenant, and demo data. Requires Developer Mode."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Developer Mode" description="Feature flag stored in Platform Settings." />
          <CardBody className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(settings.data?.developerMode)}
                disabled={updateSettings.isPending}
                onChange={(e) => void updateSettings.mutateAsync({ developerMode: e.target.checked })}
              />
              Enable Developer Mode
            </label>
            <p className="text-muted-foreground">
              When off, seed/generate endpoints reject requests. Lifecycle resets remain available from Tenants.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Target Tenant" description="Choose a non-protected tenant." />
          <CardBody>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            >
              <option value="">Select tenant…</option>
              {(tenants.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName || t.name} ({t.slug})
                </option>
              ))}
            </select>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ToolButton
          label="Reset PBX"
          danger
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => selected && setLifecycle({ kind: 'reset_pbx', name: selected.displayName || selected.name })}
        />
        <ToolButton
          label="Reset Tenant (Re-Onboarding)"
          danger
          disabled={!tenantId || !canUseTools || busy}
          onClick={() =>
            selected && setLifecycle({ kind: 'reset_tenant', name: selected.displayName || selected.name })
          }
        />
        <ToolButton
          label="Seed Demo Data"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('seed-demo')}
        />
        <ToolButton
          label="Generate Extensions"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('generate-extensions', { count: 5 })}
        />
        <ToolButton
          label="Generate Devices"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('generate-devices', { count: 3 })}
        />
        <ToolButton
          label="Generate Users"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('generate-users', { count: 3 })}
        />
        <ToolButton
          label="Generate Call History"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('generate-call-history', { count: 10 })}
        />
        <ToolButton
          label="Generate Recordings"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('generate-recordings', { count: 5 })}
        />
        <ToolButton
          label="Generate SIP Credentials"
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('generate-sip')}
        />
        <ToolButton
          label="Clear Demo Data"
          danger
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('clear-demo')}
        />
        <ToolButton
          label="Reset Demo"
          danger
          disabled={!tenantId || !canUseTools || busy}
          onClick={() => void runTool('reset-demo')}
        />
      </div>

      {msg ? (
        <pre className="mt-6 overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 text-xs">{msg}</pre>
      ) : null}

      <TenantSetupWizard open={Boolean(setupId)} tenantId={setupId} onClose={() => setSetupId(null)} />
      <TenantLifecycleConfirmDialog
        open={Boolean(lifecycle)}
        kind={lifecycle?.kind ?? 'reset_pbx'}
        tenantName={lifecycle?.name ?? ''}
        busy={busy}
        onCancel={() => setLifecycle(null)}
        onConfirm={(p) => {
          if (!tenantId || !lifecycle) return;
          setBusy(true);
          const done = async () => {
            try {
              if (lifecycle.kind === 'reset_pbx') {
                await resetPbx.mutateAsync({ id: tenantId, confirmPhrase: p.confirmPhrase });
                setMsg('Reset PBX complete');
              } else if (lifecycle.kind === 'reset_tenant') {
                await resetTenant.mutateAsync({
                  id: tenantId,
                  confirmPhrase: p.confirmPhrase,
                  acknowledged: p.acknowledged,
                });
                setLifecycle(null);
                setSetupId(tenantId);
                setMsg('Reset Tenant complete — opening Setup Wizard');
                return;
              } else {
                await deleteTenant.mutateAsync({ id: tenantId, confirmPhrase: p.confirmPhrase });
                setMsg('Tenant soft-deleted');
              }
              setLifecycle(null);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : 'Failed');
            } finally {
              setBusy(false);
            }
          };
          void done();
        }}
      />
    </PageContainer>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button variant={danger ? 'destructive' : 'outline'} disabled={disabled} onClick={onClick} className="justify-start">
      {label}
    </Button>
  );
}
