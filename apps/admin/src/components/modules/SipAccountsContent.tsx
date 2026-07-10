'use client';

import { useState } from 'react';
import { detectPortal } from '../../lib/portal/detect-portal';
import { useOpsSipRegistrations } from '../../lib/hooks/queries/use-ops';
import { useTenantDevices } from '../../lib/hooks/queries/use-tenant';
import type { SipRegistrationRecord } from '../../types/portal';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import {
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type OpsSipRow = SipRegistrationRecord & { id: string };
type TenantSipRow = Record<string, unknown> & { id: string };

const opsColumns: Column<OpsSipRow>[] = [
  { key: 'username', header: 'Username', sortable: true, cell: (r) => <span className="font-mono text-xs">{String(r.username ?? '')}</span> },
  { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
  { key: 'tenant', header: 'Tenant', cell: (r) => String(r.tenantName ?? r.tenantId ?? '—') },
  { key: 'domain', header: 'Domain', cell: (r) => String(r.domain ?? '—') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? '').toLowerCase() === 'registered' ? 'online' : 'offline'} /> },
];

const tenantColumns: Column<TenantSipRow>[] = [
  { key: 'name', header: 'Device', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '—') },
  { key: 'registration', header: 'Registration', cell: (r) => {
    const sip = r.sipEndpoint as { registrationStatus?: string } | undefined;
    return <StatusBadge status={sip?.registrationStatus === 'REGISTERED' ? 'online' : 'offline'} />;
  }},
  { key: 'lastReg', header: 'Last Registered', cell: (r) => {
    const sip = r.sipEndpoint as { lastRegisteredAt?: string } | undefined;
    return sip?.lastRegisteredAt ? new Date(sip.lastRegisteredAt).toLocaleString() : '—';
  }},
];

export function SipAccountsContent() {
  const portal = detectPortal();
  const [search, setSearch] = useState('');
  const opsQuery = useOpsSipRegistrations({ limit: 200 });
  const tenantQuery = useTenantDevices(search);

  if (portal === 'tenant') {
    const rows = withRowIds(tenantQuery.data ?? []) as TenantSipRow[];
    return (
      <ModuleAccessGate moduleId="sip-accounts">
        {({ module }) => (
          <ModuleListShell
            module={module}
            query={{ ...tenantQuery, data: rows }}
            columns={tenantColumns}
            search={search}
            onSearchChange={setSearch}
            emptyTitle="No SIP registrations"
            emptyDescription="SIP endpoint registrations will appear here when devices register."
            filterRows={(data, q) => defaultSearchFilter(data, q)}
          />
        )}
      </ModuleAccessGate>
    );
  }

  const rows = withRowIds(opsQuery.data ?? []) as OpsSipRow[];

  return (
    <ModuleAccessGate moduleId="sip-accounts">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...opsQuery, data: rows }}
          columns={opsColumns}
          search={search}
          onSearchChange={setSearch}
          emptyTitle="No SIP registrations"
          emptyDescription="SIP endpoint registrations will appear here when devices register."
          filterRows={(data, q) => defaultSearchFilter(data, q)}
        />
      )}
    </ModuleAccessGate>
  );
}
