'use client';

import { useState } from 'react';
import { useAuth, usePermissions } from '../../../lib/auth/AuthProvider';
import {
  useDeleteTenantConfirmed,
  useFactoryResetTenant,
  useResetTenant,
  useResetTenantPbx,
} from '../../../lib/hooks/queries/use-platform';
import {
  canPlatformDeleteTenant,
  canPlatformResetPbx,
  canPlatformResetTenant,
  isPlatformAdministrator,
  isProtectedTenantSlug,
} from '../../../lib/rbac/permissions';
import { platformPortalOrigin } from '../../../lib/portal/portal-origins';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import {
  TenantLifecycleConfirmDialog,
  type LifecycleDialogKind,
} from '../tenants/TenantLifecycleConfirmDialog';
import { TenantSetupWizard } from '../tenants/TenantSetupWizard';

export function SecurityDangerZoneCard() {
  const { session } = useAuth();
  const permissions = usePermissions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleDialogKind | null>(null);

  const resetPbx = useResetTenantPbx();
  const resetTenant = useResetTenant();
  const factoryReset = useFactoryResetTenant();
  const deleteTenant = useDeleteTenantConfirmed();

  const isPlatformAdmin = isPlatformAdministrator(session, permissions);
  const tenantId = session?.tenantId ?? '';
  const tenantName = session?.tenant?.name ?? session?.tenant?.slug ?? 'Tenant';
  const tenantSlug = session?.tenant?.slug ?? '';
  const protectedTenant = isProtectedTenantSlug(tenantSlug);

  const runLifecycle = async (payload: { confirmPhrase: string; acknowledged: boolean }) => {
    if (!lifecycle || !tenantId) return;
    setError(null);
    setBusy(true);
    try {
      if (lifecycle === 'reset_pbx') {
        await resetPbx.mutateAsync({ id: tenantId, confirmPhrase: payload.confirmPhrase });
        setLifecycle(null);
      } else if (lifecycle === 'reset_tenant') {
        await resetTenant.mutateAsync({
          id: tenantId,
          confirmPhrase: payload.confirmPhrase,
          acknowledged: payload.acknowledged,
        });
        setLifecycle(null);
        setSetupOpen(true);
      } else if (lifecycle === 'factory_reset') {
        await factoryReset.mutateAsync({
          id: tenantId,
          confirmPhrase: payload.confirmPhrase,
          acknowledged: payload.acknowledged,
        });
        setLifecycle(null);
        setSetupOpen(true);
      } else {
        await deleteTenant.mutateAsync({ id: tenantId, confirmPhrase: payload.confirmPhrase });
        setLifecycle(null);
        if (session?.impersonatorUserId) {
          window.location.href = `${platformPortalOrigin()}/tenants`;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lifecycle operation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="glass-card border-destructive/40 lg:col-span-2">
        <CardHeader
          title="Danger Zone"
          description={
            isPlatformAdmin
              ? 'Destructive tenant lifecycle operations for the current tenant.'
              : 'Destructive tenant lifecycle operations. Factory Reset and Delete are platform-only for Customer Pilot.'
          }
        />
        <CardBody className="space-y-4 text-sm">
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              {error}
            </div>
          ) : null}

          {isPlatformAdmin ? (
            <>
              <p className="text-muted-foreground">
                These actions apply to{' '}
                <span className="font-medium text-foreground">{tenantName}</span>
                {tenantSlug ? (
                  <>
                    {' '}
                    (<span className="font-mono text-xs">{tenantSlug}</span>)
                  </>
                ) : null}
                . Reset PBX keeps users and DID ownership. Reset Tenant and Factory Reset prepare
                onboarding again without releasing DIDs. Delete soft-deletes the tenant and returns DIDs
                to Global Inventory.
              </p>

              {protectedTenant ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-900 dark:text-amber-100">
                  Lifecycle actions are disabled for protected platform tenants.
                </p>
              ) : (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Tenant lifecycle actions"
                >
                  {canPlatformResetPbx(permissions) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !tenantId}
                      aria-busy={busy && lifecycle === 'reset_pbx'}
                      onClick={() => setLifecycle('reset_pbx')}
                    >
                      Reset PBX
                    </Button>
                  ) : null}
                  {canPlatformResetTenant(permissions) ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !tenantId}
                        aria-busy={busy && lifecycle === 'reset_tenant'}
                        onClick={() => setLifecycle('reset_tenant')}
                      >
                        Reset Tenant
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !tenantId}
                        aria-busy={busy && lifecycle === 'factory_reset'}
                        onClick={() => setLifecycle('factory_reset')}
                      >
                        Factory Reset
                      </Button>
                    </>
                  ) : null}
                  {canPlatformDeleteTenant(permissions) ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy || !tenantId}
                      aria-busy={busy && lifecycle === 'delete'}
                      onClick={() => setLifecycle('delete')}
                    >
                      Delete Tenant
                    </Button>
                  ) : null}
                </div>
              )}

              {session?.impersonatorUserId ? (
                <p className="text-xs text-muted-foreground">
                  You are impersonating this tenant. Destructive actions run against the impersonated
                  tenant context.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="font-medium text-destructive">Reset PBX / Reset Tenant / Delete Tenant</p>
              <p className="mt-1 text-muted-foreground">
                Destructive tenant lifecycle operations are restricted to Platform Administrators. Contact
                platform support if you need assisted export or tenant recovery.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Factory Reset and Delete are platform-only for Customer Pilot.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <TenantLifecycleConfirmDialog
        open={Boolean(lifecycle)}
        kind={lifecycle ?? 'reset_pbx'}
        tenantName={tenantName}
        busy={busy}
        onCancel={() => setLifecycle(null)}
        onConfirm={(payload) => void runLifecycle(payload)}
      />

      <TenantSetupWizard open={setupOpen} tenantId={tenantId || null} onClose={() => setSetupOpen(false)} />
    </>
  );
}
