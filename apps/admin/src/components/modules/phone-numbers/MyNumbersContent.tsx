'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate, ModuleListShell, withRowIds } from '../shared/ModuleShell';
import type { Column } from '../../data/DataTable';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/Badge';
import { AssignDidDrawer } from './AssignDidDrawer';
import { formatExtensionLabel } from '../../../lib/extensions/format-extension-label';

type DidRow = Record<string, unknown> & {
  id: string;
  number: string;
  routed?: boolean;
  line?: { extension?: { extension?: string }; user?: { profile?: { displayName?: string } } };
  routing?: { destinationType?: string } | null;
};

type Filter = 'all' | 'unrouted' | 'routed';

function routedLabel(row: DidRow) {
  if (row.routing?.destinationType) return String(row.routing.destinationType);
  const ext = row.line?.extension?.extension;
  if (ext) {
    const name = (row.line as { name?: string })?.name ?? row.line?.user?.profile?.displayName;
    return formatExtensionLabel(ext, name);
  }
  return '— Not assigned —';
}

export function MyNumbersContent() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [assignDid, setAssignDid] = useState<DidRow | null>(null);
  const query = useTenantDids(search);

  const rows = useMemo(() => {
    const all = withRowIds(query.data ?? []) as DidRow[];
    if (filter === 'unrouted') return all.filter((r) => !r.routed && !r.routing);
    if (filter === 'routed') return all.filter((r) => r.routed || r.routing);
    return all;
  }, [query.data, filter]);

  const columns: Column<DidRow>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (r) => <span className="font-mono font-medium">{String(r.number)}</span>,
    },
    {
      key: 'routed',
      header: 'Routed to',
      cell: (r) => (
        <span className={routedLabel(r).includes('Not assigned') ? 'text-muted-foreground' : ''}>
          {routedLabel(r)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: () => <StatusBadge status="active" />,
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <Button size="sm" variant={routedLabel(r).includes('Not assigned') ? 'default' : 'outline'} onClick={() => setAssignDid(r)}>
          {routedLabel(r).includes('Not assigned') ? 'Assign' : 'Change'}
        </Button>
      ),
    },
  ];

  return (
    <ModuleAccessGate moduleId="number-inventory">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            emptyTitle="No phone numbers"
            emptyDescription="Request numbers from the platform — tenants cannot browse carrier inventory."
            headerActions={
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'unrouted', 'routed'] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'unrouted' ? 'Unassigned' : 'Routed'}
                  </Button>
                ))}
                <Link href="/phone-numbers/requests">
                  <Button size="sm" variant="outline">
                    Request number
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                  Refresh
                </Button>
              </div>
            }
          />
          <AssignDidDrawer
            open={Boolean(assignDid)}
            did={assignDid}
            onClose={() => setAssignDid(null)}
            onSaved={() => void query.refetch()}
          />
        </>
      )}
    </ModuleAccessGate>
  );
}
