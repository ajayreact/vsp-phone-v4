'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTenantDevices } from '../../lib/hooks/queries/use-tenant';
import { formatExtensionLabel } from '../../lib/extensions/format-extension-label';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { Column } from '../data/DataTable';
import {
  defaultSearchFilter,
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';

type DeviceRow = Record<string, unknown> & { id: string };

function userLabel(row: DeviceRow): string {
  const user = row.user as { email?: string; profile?: { displayName?: string } } | undefined;
  const line = row.line as { user?: { email?: string; profile?: { displayName?: string } } } | undefined;
  const u = user ?? line?.user;
  return u?.profile?.displayName ?? u?.email ?? '—';
}

function extensionLabel(row: DeviceRow): string {
  const line = row.line as { extension?: { extension?: string }; name?: string } | undefined;
  const ext = line?.extension?.extension;
  if (!ext) return '—';
  return formatExtensionLabel(ext, line?.name);
}

function statusTone(status: string): 'online' | 'offline' | 'pending' | 'active' {
  const s = status.toLowerCase();
  if (s === 'registered' || s === 'online') return 'online';
  if (s === 'inactive') return 'offline';
  if (s === 'provisioning' || s === 'pending') return 'pending';
  return 'offline';
}

export function DevicesContent() {
  const [search, setSearch] = useState('');
  const query = useTenantDevices(search);

  const rows = withRowIds(
    (query.data ?? []).filter((r) => String((r as DeviceRow).deviceType ?? 'DESK_PHONE') === 'DESK_PHONE'),
  ) as DeviceRow[];

  const columns: Column<DeviceRow>[] = [
    { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
    { key: 'manufacturer', header: 'Manufacturer', cell: (r) => String(r.manufacturer ?? '—') },
    { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '—') },
    { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.macAddress ?? '—')}</span> },
    { key: 'extension', header: 'Extension', cell: (r) => extensionLabel(r) },
    { key: 'user', header: 'User', cell: (r) => userLabel(r) },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={statusTone(String(r.status ?? ''))} /> },
    {
      key: 'provisioning',
      header: 'Provisioning',
      cell: (r) => <StatusBadge status={statusTone(String(r.provisioningStatus ?? 'pending'))} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => {
        const extId = (r.line as { extension?: { id?: string } } | undefined)?.extension?.id;
        if (!extId) return null;
        return (
          <Link href={`/extensions?configure=${encodeURIComponent(extId)}&tab=desk`}>
            <Button size="sm" variant="outline">
              Manage in Extensions
            </Button>
          </Link>
        );
      },
    },
  ];

  return (
    <ModuleAccessGate moduleId="devices">
      {({ module }) => (
        <ModuleListShell
          module={{
            ...module,
            description:
              'Read-only desk phone inventory. Add, edit, and provision devices from Extensions → Configure.',
          }}
          query={{ ...query, data: rows }}
          columns={columns}
          search={search}
          onSearchChange={setSearch}
          emptyTitle="No desk phones in inventory"
          emptyDescription="Register desk phones from Extensions → Configure → Device."
          filterRows={(data, q) => defaultSearchFilter(data, q)}
          headerActions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/extensions">
                <Button size="sm" variant="default">
                  Manage on Extensions
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          }
        />
      )}
    </ModuleAccessGate>
  );
}
