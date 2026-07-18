'use client';

import { MoreHorizontal } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { startTenantImpersonation } from '../../lib/api/auth';
import { getAccessToken } from '../../lib/auth/session';
import {
  useActivateTenant,
  useDeleteTenantConfirmed,
  usePlatformTenants,
  useResetTenant,
  useResetTenantPbx,
  useSuspendTenant,
} from '../../lib/hooks/queries/use-platform';
import { tenantPortalOrigin } from '../../lib/portal/portal-origins';
import type { PlatformTenantRecord } from '../../types/portal';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';
import {
  TenantLifecycleConfirmDialog,
  type LifecycleDialogKind,
} from './tenants/TenantLifecycleConfirmDialog';
import { TenantOnboardingWizard } from './tenants/TenantOnboardingWizard';
import { TenantSetupWizard } from './tenants/TenantSetupWizard';

type TenantRow = PlatformTenantRecord & { id: string };

const PROTECTED_SLUGS = new Set(['platform', 'inventory', 'platform-inventory', 'vsp-internal']);

export function TenantsContent() {
  const [search, setSearch] = useState('');
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [setupTenantId, setSetupTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    kind: LifecycleDialogKind;
    row: TenantRow;
  } | null>(null);

  const query = usePlatformTenants(search ? { search } : undefined);
  const rows = withRowIds(query.data ?? []) as TenantRow[];
  const suspend = useSuspendTenant();
  const activate = useActivateTenant();
  const resetPbx = useResetTenantPbx();
  const resetTenant = useResetTenant();
  const deleteConfirmed = useDeleteTenantConfirmed();

  const loginAsTenant = useCallback(async (row: TenantRow) => {
    setError(null);
    setBusyId(row.id);
    setMenuId(null);
    try {
      const token = getAccessToken();
      if (!token) throw new Error('Not signed in');
      const result = await startTenantImpersonation(token, row.id);
      const url = `${tenantPortalOrigin()}/impersonate?code=${encodeURIComponent(result.handoffCode)}`;
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impersonation failed');
      setBusyId(null);
    }
  }, []);

  const runLifecycle = async (payload: { confirmPhrase: string; acknowledged: boolean }) => {
    if (!lifecycle) return;
    setError(null);
    setBusyId(lifecycle.row.id);
    try {
      if (lifecycle.kind === 'reset_pbx') {
        await resetPbx.mutateAsync({ id: lifecycle.row.id, confirmPhrase: payload.confirmPhrase });
      } else if (lifecycle.kind === 'reset_tenant') {
        await resetTenant.mutateAsync({
          id: lifecycle.row.id,
          confirmPhrase: payload.confirmPhrase,
          acknowledged: payload.acknowledged,
        });
        setLifecycle(null);
        setSetupTenantId(lifecycle.row.id);
        return;
      } else {
        await deleteConfirmed.mutateAsync({
          id: lifecycle.row.id,
          confirmPhrase: payload.confirmPhrase,
        });
      }
      setLifecycle(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lifecycle operation failed');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<Column<TenantRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Tenant',
        sortable: true,
        cell: (r) => (
          <div>
            <div className="font-medium">{r.displayName || r.name}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{r.slug}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (r) => (
          <StatusBadge
            status={
              r.status === 'ACTIVE'
                ? 'active'
                : r.status === 'SUSPENDED'
                  ? 'warning'
                  : r.status === 'DELETED'
                    ? 'inactive'
                    : 'pending'
            }
          />
        ),
      },
      {
        key: 'users',
        header: 'Users',
        cell: (r) => <span className="tabular-nums">{r.usersCount ?? '—'}</span>,
      },
      {
        key: 'extensions',
        header: 'Extensions',
        cell: (r) => <span className="tabular-nums">{r.extensionsCount ?? '—'}</span>,
      },
      {
        key: 'devices',
        header: 'Devices',
        cell: (r) => <span className="tabular-nums">{r.devicesCount ?? '—'}</span>,
      },
      {
        key: 'dids',
        header: 'Assigned DIDs',
        cell: (r) => (
          <span className="tabular-nums">
            {r.assignedDidsCount ?? 0}
            {typeof r.didsCount === 'number' ? ` / ${r.didsCount}` : ''}
          </span>
        ),
      },
      {
        key: 'storage',
        header: 'Storage',
        cell: (r) => (
          <span className="tabular-nums text-muted-foreground">
            {r.storageLimitGb != null ? `${r.storageLimitGb} GB` : '—'}
          </span>
        ),
      },
      {
        key: 'created',
        header: 'Created',
        cell: (r) => (
          <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
        ),
      },
      {
        key: 'lastLogin',
        header: 'Last Login',
        cell: (r) => (
          <span className="text-muted-foreground">
            {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : '—'}
          </span>
        ),
      },
      {
        key: 'progress',
        header: 'Progress',
        cell: (r) => (
          <span className="tabular-nums text-muted-foreground">{r.setupProgressPercent ?? 0}%</span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        cell: (r) => {
          const protectedSlug = PROTECTED_SLUGS.has(String(r.slug || '').toLowerCase());
          if (protectedSlug || r.status === 'DELETED') {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const open = menuId === r.id;
          return (
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                aria-label="Tenant actions"
                onClick={() => setMenuId(open ? null : r.id)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {open ? (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border bg-card py-1 shadow-lg">
                  <MenuItem
                    label="Open"
                    onClick={() => {
                      setMenuId(null);
                      void loginAsTenant(r);
                    }}
                  />
                  <MenuItem
                    label="Impersonate"
                    onClick={() => {
                      setMenuId(null);
                      void loginAsTenant(r);
                    }}
                  />
                  {r.status === 'SUSPENDED' ? (
                    <MenuItem
                      label="Activate"
                      onClick={() => {
                        setMenuId(null);
                        void activate.mutateAsync(r.id).catch((e) =>
                          setError(e instanceof Error ? e.message : 'Activate failed'),
                        );
                      }}
                    />
                  ) : r.status !== 'PENDING' ? (
                    <MenuItem
                      label="Suspend"
                      onClick={() => {
                        setMenuId(null);
                        void suspend.mutateAsync(r.id).catch((e) =>
                          setError(e instanceof Error ? e.message : 'Suspend failed'),
                        );
                      }}
                    />
                  ) : null}
                  {r.status === 'PENDING' ? (
                    <MenuItem
                      label="Continue Setup"
                      onClick={() => {
                        setMenuId(null);
                        setSetupTenantId(r.id);
                      }}
                    />
                  ) : null}
                  <MenuItem
                    label="Reset PBX"
                    danger
                    onClick={() => {
                      setMenuId(null);
                      setLifecycle({ kind: 'reset_pbx', row: r });
                    }}
                  />
                  <MenuItem
                    label="Reset Tenant (Re-Onboarding)"
                    danger
                    onClick={() => {
                      setMenuId(null);
                      setLifecycle({ kind: 'reset_tenant', row: r });
                    }}
                  />
                  <MenuItem
                    label="Delete Tenant"
                    danger
                    onClick={() => {
                      setMenuId(null);
                      setLifecycle({ kind: 'delete', row: r });
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        },
      },
    ],
    [activate, loginAsTenant, menuId, suspend],
  );

  return (
    <ModuleAccessGate moduleId="tenants">
      {({ module }) => (
        <>
          {error ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tenants by name or slug…"
            emptyTitle="No tenants yet"
            emptyDescription="Run the onboarding wizard to provision your first tenant organization."
            primaryAction={
              <CreateButton label="Onboard Tenant" onClick={() => setOnboardOpen(true)} />
            }
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />
          <TenantOnboardingWizard open={onboardOpen} onClose={() => setOnboardOpen(false)} />
          <TenantSetupWizard
            open={Boolean(setupTenantId)}
            tenantId={setupTenantId}
            onClose={() => setSetupTenantId(null)}
          />
          <TenantLifecycleConfirmDialog
            open={Boolean(lifecycle)}
            kind={lifecycle?.kind ?? 'reset_pbx'}
            tenantName={lifecycle?.row.displayName || lifecycle?.row.name || ''}
            busy={Boolean(busyId)}
            onCancel={() => setLifecycle(null)}
            onConfirm={(p) => void runLifecycle(p)}
          />
        </>
      )}
    </ModuleAccessGate>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
        danger ? 'text-destructive' : 'text-foreground'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
