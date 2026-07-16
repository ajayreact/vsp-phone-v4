'use client';

import { useCallback, useMemo, useState } from 'react';
import { startTenantImpersonation } from '../../lib/api/auth';
import { getAccessToken } from '../../lib/auth/session';
import { usePlatformTenants } from '../../lib/hooks/queries/use-platform';
import { tenantPortalOrigin } from '../../lib/portal/portal-origins';
import type { PlatformTenantRecord } from '../../types/portal';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { TenantOnboardingWizard } from './tenants/TenantOnboardingWizard';
import {
  CreateButton,
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type TenantRow = PlatformTenantRecord & { id: string };

const PROTECTED_SLUGS = new Set(['platform', 'inventory', 'platform-inventory', 'vsp-internal']);

export function TenantsContent() {
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = usePlatformTenants(search ? { search } : undefined);
  const rows = withRowIds(query.data ?? []) as TenantRow[];

  const loginAsTenant = useCallback(async (row: TenantRow) => {
    setError(null);
    setBusyId(row.id);
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

  const columns = useMemo<Column<TenantRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        cell: (r) => <span className="font-medium">{r.displayName || r.name}</span>,
      },
      {
        key: 'slug',
        header: 'Slug',
        cell: (r) => <span className="font-mono text-xs">{r.slug}</span>,
      },
      {
        key: 'publicId',
        header: 'Public ID',
        cell: (r) => <span className="font-mono text-xs">{r.publicId}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        cell: (r) => (
          <StatusBadge
            status={
              r.status === 'ACTIVE' ? 'active' : r.status === 'SUSPENDED' ? 'warning' : 'pending'
            }
          />
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
        key: 'impersonate',
        header: 'Access',
        cell: (r) => {
          const protectedSlug = PROTECTED_SLUGS.has(String(r.slug || '').toLowerCase());
          if (protectedSlug) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === r.id}
              onClick={() => void loginAsTenant(r)}
            >
              {busyId === r.id ? 'Opening…' : 'Login as Tenant'}
            </Button>
          );
        },
      },
    ],
    [busyId, loginAsTenant],
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
            primaryAction={<CreateButton label="Onboard Tenant" onClick={() => setWizardOpen(true)} />}
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />
          <TenantOnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
        </>
      )}
    </ModuleAccessGate>
  );
}
