'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useExtensionUnassignDid } from '../../../lib/hooks/queries/use-extension-hub';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { formatExtensionLabel } from '../../../lib/extensions/format-extension-label';
import { ModuleAccessGate, ModuleListShell, withRowIds } from '../shared/ModuleShell';
import type { Column } from '../../data/DataTable';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/Badge';

type DidRow = Record<string, unknown> & {
  id: string;
  number: string;
  routed?: boolean;
  line?: {
    id?: string;
    name?: string;
    extension?: { id?: string; extension?: string };
    user?: { profile?: { displayName?: string } };
  } | null;
  routing?: { destinationType?: string } | null;
};

type Filter = 'all' | 'unassigned' | 'assigned';

function formatPhone(number: string) {
  const digits = number.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return number;
}

function extensionNumber(row: DidRow): string {
  return row.line?.extension?.extension ?? '';
}

function extensionName(row: DidRow): string {
  const ext = extensionNumber(row);
  if (!ext) return '—';
  const name =
    row.line?.name ?? row.line?.user?.profile?.displayName ?? null;
  return formatExtensionLabel(ext, name);
}

function didStatus(row: DidRow): 'assigned' | 'unassigned' {
  return extensionNumber(row) || row.routed || row.routing ? 'assigned' : 'unassigned';
}

export function MyNumbersContent() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useTenantDids(search);
  const unassignDid = useExtensionUnassignDid();

  const rows = useMemo(() => {
    const all = withRowIds(query.data ?? []) as DidRow[];
    if (filter === 'unassigned') return all.filter((r) => didStatus(r) === 'unassigned');
    if (filter === 'assigned') return all.filter((r) => didStatus(r) === 'assigned');
    return all;
  }, [query.data, filter]);

  const removeDid = async (row: DidRow) => {
    const extensionId = row.line?.extension?.id;
    if (!extensionId) {
      setError('This number is not bound to an extension.');
      return;
    }
    setError(null);
    setBusyId(row.id);
    try {
      await unassignDid.mutateAsync(extensionId);
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove DID');
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<DidRow>[] = [
    {
      key: 'number',
      header: 'DID',
      cell: (r) => <span className="font-mono font-medium">{formatPhone(String(r.number))}</span>,
    },
    {
      key: 'extension',
      header: 'Assigned Extension',
      cell: (r) => (
        <span className="font-mono">{extensionNumber(r) || '—'}</span>
      ),
    },
    {
      key: 'extensionName',
      header: 'Extension Name',
      cell: (r) => <span>{extensionName(r)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusBadge status={didStatus(r) === 'assigned' ? 'active' : 'pending'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => {
        const extensionId = r.line?.extension?.id;
        if (!extensionId) return null;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/extensions?configure=${extensionId}&tab=did`}>
              <Button size="sm" variant="outline">
                Open extension
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === r.id || unassignDid.isPending}
              onClick={() => void removeDid(r)}
            >
              {busyId === r.id ? 'Removing…' : 'Remove DID'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <ModuleAccessGate moduleId="number-inventory">
      {({ module }) => (
        <>
          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <ModuleListShell
            module={{
              ...module,
              description:
                'Read-only inventory. Platform Admin assigns numbers to your tenant — extensions are created automatically. Manage setup from Extensions → Configure.',
            }}
            query={{ ...query, data: rows }}
            columns={columns}
            search={search}
            onSearchChange={setSearch}
            emptyTitle="No phone numbers"
            emptyDescription="Request numbers from the platform. Assignment is performed by Platform Admin."
            headerActions={
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'unassigned', 'assigned'] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'unassigned' ? 'Unassigned' : 'Assigned'}
                  </Button>
                ))}
                <Link href="/phone-numbers/requests">
                  <Button size="sm" variant="outline">
                    Request number
                  </Button>
                </Link>
                <Link href="/extensions">
                  <Button size="sm" variant="outline">
                    Extensions
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                >
                  Refresh
                </Button>
              </div>
            }
          />
        </>
      )}
    </ModuleAccessGate>
  );
}
