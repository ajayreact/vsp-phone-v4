'use client';

import { Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  normalizeConfigureTab,
  useExtensionHub,
  useExtensionRestartRegistration,
  type ConfigureTabId,
  type ExtensionHubRow,
} from '../../../lib/hooks/queries/use-extension-hub';
import { useCreateTenantExtension } from '../../../lib/hooks/queries/use-tenant-mutations';
import { PERMISSIONS } from '../../../lib/rbac/permissions';
import { hasPermission } from '../../../lib/rbac/permissions';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import { DataTable, type Column } from '../../data/DataTable';
import type { ActionItem } from '../../data/ActionDropdown';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Skeleton } from '../../ui/Skeleton';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { ExtensionConfigureModal } from './ExtensionConfigureModal';
import { ExtensionHubStats } from './ExtensionHubStats';
import { ExtensionStatusChip } from './ExtensionStatusChip';

type HubFilter = 'all' | 'online' | 'offline' | 'no-device' | 'configured' | 'pending';

const FILTER_OPTIONS: { id: HubFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'configured', label: 'Configured' },
  { id: 'pending', label: 'Pending' },
  { id: 'no-device', label: 'Needs Setup' },
];

function matchesSearch(row: ExtensionHubRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const didList = row.dids?.length
    ? row.dids
    : row.did
      ? [row.did]
      : [];
  const didText = didList.map((d) => `${d.formatted} ${d.number}`).join(' ');
  const digits = didText.replace(/\D/g, '');
  const qDigits = q.replace(/\D/g, '');
  const user = row.linkedUser?.displayName ?? row.linkedUser?.email ?? '';
  const device = row.device?.deviceLabel ?? row.device?.name ?? '';
  return (
    row.extension.toLowerCase().includes(q) ||
    row.displayName.toLowerCase().includes(q) ||
    row.label.toLowerCase().includes(q) ||
    didText.toLowerCase().includes(q) ||
    user.toLowerCase().includes(q) ||
    device.toLowerCase().includes(q) ||
    (qDigits.length > 0 && digits.includes(qDigits))
  );
}

function assignedNumbers(row: ExtensionHubRow): Array<{ id: string; formatted: string }> {
  if (row.dids?.length) return row.dids.map((d) => ({ id: d.id, formatted: d.formatted }));
  if (row.did) return [{ id: row.did.id, formatted: row.did.formatted }];
  return [];
}

function matchesFilter(row: ExtensionHubRow, filter: HubFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'no-device') {
    return row.statusLabel === 'Needs Setup' || row.status === 'NoDevice';
  }
  if (filter === 'online') return row.onlineStatus === 'Online';
  if (filter === 'offline') {
    return row.onlineStatus === 'Offline' && row.statusLabel !== 'Needs Setup' && row.status !== 'NoDevice';
  }
  if (filter === 'configured') return (row.provisionLabel ?? '') === 'Configured';
  if (filter === 'pending') return (row.provisionLabel ?? 'Pending') !== 'Configured';
  return true;
}

function deviceLabel(row: ExtensionHubRow): string {
  if (row.device?.deviceLabel) return row.device.deviceLabel;
  if (row.hasMobileApp && !row.hasDeskPhone) return 'Mobile App';
  if (row.hasDeskPhone && row.device?.model) {
    return `${row.device.manufacturer ?? ''} ${row.device.model}`.trim();
  }
  return '—';
}

export function ExtensionsHubContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_EXTENSIONS_MANAGE);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HubFilter>('all');
  const [configureRow, setConfigureRow] = useState<ExtensionHubRow | null>(null);
  const [configureTab, setConfigureTab] = useState<ConfigureTabId>('general');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newExtension, setNewExtension] = useState('');
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const query = useExtensionHub();
  const restartReg = useExtensionRestartRegistration();
  const createExt = useCreateTenantExtension();

  const rows = useMemo(() => {
    const all = query.data ?? [];
    return all.filter((row) => matchesSearch(row, search) && matchesFilter(row, filter));
  }, [query.data, search, filter]);

  const openConfigure = useCallback((row: ExtensionHubRow, tab: ConfigureTabId = 'general') => {
    setConfigureTab(tab);
    setConfigureRow(row);
  }, []);

  const closeConfigure = useCallback(() => {
    setConfigureRow(null);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has('configure') || params.has('tab')) {
      params.delete('configure');
      params.delete('tab');
      const q = params.toString();
      router.replace(q ? `/extensions?${q}` : '/extensions');
    }
  }, [router, searchParams]);

  const refresh = useCallback(() => void query.refetch(), [query]);

  useEffect(() => {
    const configureId = searchParams.get('configure');
    if (!configureId || !query.data?.length) return;
    const row = query.data.find((r) => r.id === configureId);
    if (!row) return;
    const tabParam = searchParams.get('tab') as ConfigureTabId | null;
    openConfigure(row, normalizeConfigureTab(tabParam ?? 'general'));
  }, [searchParams, query.data, openConfigure]);

  const submitCreate = async () => {
    if (!newExtension.trim()) {
      setCreateError('Extension number is required.');
      return;
    }
    setCreateError(null);
    try {
      await createExt.mutateAsync({
        extension: newExtension.trim(),
        lineName: newName.trim() || undefined,
      });
      setCreateOpen(false);
      setNewExtension('');
      setNewName('');
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create extension');
    }
  };

  const bulkRestart = async () => {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(selectedIds.map((id) => restartReg.mutateAsync(id)));
      setSelectedIds([]);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk restart failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const columns = useMemo<Column<ExtensionHubRow>[]>(
    () => [
      {
        key: 'extension',
        header: 'Ext',
        sortable: true,
        sortValue: (r) => r.extension,
        cell: (row) => <span className="font-mono font-medium">{row.extension}</span>,
      },
      {
        key: 'displayName',
        header: 'Name',
        sortable: true,
        sortValue: (r) => r.displayName,
        cell: (row) => <span className="font-medium">{row.displayName}</span>,
      },
      {
        key: 'did',
        header: 'DID',
        sortable: true,
        sortValue: (r) => assignedNumbers(r).map((d) => d.formatted).join(' '),
        cell: (row) => {
          const numbers = assignedNumbers(row);
          if (!numbers.length) return <span className="text-muted-foreground">Unassigned</span>;
          return (
            <div className="flex flex-col gap-0.5">
              {numbers.map((d) => (
                <span key={d.id} className="font-mono text-xs sm:text-sm whitespace-nowrap">
                  {d.formatted}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        key: 'device',
        header: 'Device',
        sortable: true,
        sortValue: (r) => deviceLabel(r),
        cell: (row) => {
          const label = deviceLabel(row);
          return label === '—' ? <span className="text-muted-foreground">None</span> : <span>{label}</span>;
        },
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        sortValue: (r) => `${r.onlineStatus}-${r.statusLabel}`,
        cell: (row) => (
          <ExtensionStatusChip
            status={row.status}
            onlineStatus={row.onlineStatus}
            statusLabel={row.statusLabel}
          />
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        cell: (row) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openConfigure(row, 'general')}
            aria-label={`Configure ${row.label}`}
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Configure
          </Button>
        ),
      },
    ],
    [openConfigure],
  );

  const rowActions = useCallback(
    (row: ExtensionHubRow): ActionItem[] => [
      { id: 'configure', label: 'Configure', onSelect: () => openConfigure(row, 'general') },
      { id: 'did', label: 'DID', onSelect: () => openConfigure(row, 'did') },
      { id: 'device', label: 'Device', onSelect: () => openConfigure(row, 'devices') },
      { id: 'provisioning', label: 'Provisioning', onSelect: () => openConfigure(row, 'desk') },
      {
        id: 'history',
        label: 'Call History',
        onSelect: () => {
          window.location.href = `/reports/cdr?extension=${encodeURIComponent(row.extension)}`;
        },
      },
      {
        id: 'restart',
        label: 'Restart Registration',
        onSelect: () => void restartReg.mutateAsync(row.id).then(refresh),
      },
    ],
    [openConfigure, refresh, restartReg],
  );

  return (
    <ModuleAccessGate moduleId="extensions">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title="Extensions"
            description={
              module.description ??
              'Primary workspace — extensions are created when Platform Admin assigns a number. Configure everything from one screen.'
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={refresh} disabled={query.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
                  Refresh
                </Button>
                {canWrite ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Extension
                  </Button>
                ) : null}
              </div>
            }
          />

          <ExtensionHubStats />

          <div className="mb-4 space-y-3">
            <div className="relative max-w-lg">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                placeholder="Search extensions, names, users, or phone numbers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search extensions"
              />
            </div>

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter extensions"
            >
              {FILTER_OPTIONS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? 'default' : 'outline'}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            {canWrite && selectedIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{selectedIds.length} selected</span>
                <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => void bulkRestart()}>
                  Restart Registration
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy || selectedIds.length !== 1}
                  onClick={() => {
                    const row = rows.find((r) => r.id === selectedIds[0]);
                    if (row) openConfigure(row, 'general');
                  }}
                >
                  Configure
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <QueryState
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            onRetry={refresh}
            isEmpty={!rows.length && !query.isLoading}
            empty={
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                {query.data?.length ? (
                  <>
                    <p className="mb-2 font-medium text-foreground">No extensions match your filters.</p>
                    <p>Try a different search term or filter.</p>
                  </>
                ) : (
                  <>
                    <p className="mb-2 font-medium text-foreground">No extensions yet.</p>
                    <p>
                      Extensions appear automatically when Platform Admin assigns phone numbers to
                      your tenant, or add an internal extension (no DID) below. Open Configure on a
                      row to finish employee setup in under two minutes.
                    </p>
                  </>
                )}
              </div>
            }
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            }
          >
            <DataTable
              columns={columns}
              data={rows}
              pageSize={20}
              selectable={canWrite}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              rowActions={rowActions}
              emptyTitle="No extensions"
              emptyDescription="DID assignments create extensions automatically."
            />
          </QueryState>

          <ExtensionConfigureModal
            open={Boolean(configureRow)}
            onClose={closeConfigure}
            row={configureRow}
            initialTab={configureTab}
            onSaved={refresh}
          />

          <Modal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            title="Add Extension"
            description="Creates an internal extension with no DID. Assign a number later from Platform Admin, or manage identity/devices from Configure."
            footer={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createExt.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => void submitCreate()} disabled={createExt.isPending}>
                  {createExt.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {createError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {createError}
                </div>
              ) : null}
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Extension Number</span>
                <Input
                  value={newExtension}
                  onChange={(e) => setNewExtension(e.target.value)}
                  placeholder="e.g. 200"
                  className="font-mono"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Display Name</span>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Conference Room"
                />
              </label>
            </div>
          </Modal>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
