'use client';

import { RefreshCw, Search, Settings } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  normalizeConfigureTab,
  useExtensionHub,
  useExtensionRestartRegistration,
  type ConfigureTabId,
  type ExtensionHubRow,
} from '../../../lib/hooks/queries/use-extension-hub';
import { PERMISSIONS } from '../../../lib/rbac/permissions';
import { hasPermission } from '../../../lib/rbac/permissions';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import { DataTable, type Column } from '../../data/DataTable';
import type { ActionItem } from '../../data/ActionDropdown';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
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

function formatLastReg(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

export function ExtensionsHubContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_EXTENSIONS_WRITE);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HubFilter>('all');
  const [configureRow, setConfigureRow] = useState<ExtensionHubRow | null>(null);
  const [configureTab, setConfigureTab] = useState<ConfigureTabId>('general');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const query = useExtensionHub();
  const restartReg = useExtensionRestartRegistration();

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
        key: 'configure',
        header: 'Configure',
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
      {
        key: 'extension',
        header: 'Extension Number',
        sortable: true,
        sortValue: (r) => r.extension,
        cell: (row) => <span className="font-mono font-medium">{row.extension}</span>,
      },
      {
        key: 'displayName',
        header: 'Extension Name',
        sortable: true,
        sortValue: (r) => r.displayName,
        cell: (row) => <span className="font-medium">{row.displayName}</span>,
      },
      {
        key: 'did',
        header: 'Assigned Numbers',
        sortable: true,
        sortValue: (r) => assignedNumbers(r).map((d) => d.formatted).join(' '),
        cell: (row) => {
          const numbers = assignedNumbers(row);
          if (!numbers.length) return <span className="text-muted-foreground">—</span>;
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
        key: 'user',
        header: 'User',
        sortable: true,
        sortValue: (r) => r.linkedUser?.displayName ?? r.linkedUser?.email ?? 'Unassigned',
        cell: (row) =>
          row.linkedUser ? (
            <span>{row.linkedUser.displayName || row.linkedUser.email}</span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
      },
      {
        key: 'device',
        header: 'Device',
        sortable: true,
        sortValue: (r) => deviceLabel(r),
        cell: (row) => {
          const label = deviceLabel(row);
          return label === '—' ? <span className="text-muted-foreground">—</span> : <span>{label}</span>;
        },
      },
      {
        key: 'registration',
        header: 'Registration Status',
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
        key: 'provision',
        header: 'Provision Status',
        sortable: true,
        sortValue: (r) => r.provisionLabel ?? 'Pending',
        cell: (row) => {
          const label = row.provisionLabel ?? 'Pending';
          const tone =
            label === 'Configured'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : label === 'Failed'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-800 dark:text-amber-200';
          return (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
              {label}
            </span>
          );
        },
      },
      {
        key: 'recording',
        header: 'Call Recording',
        sortable: true,
        sortValue: (r) => (r.recordingEnabled ? 'On' : 'Off'),
        cell: (row) => (
          <span className={row.recordingEnabled ? 'text-foreground' : 'text-muted-foreground'}>
            {row.recordingEnabled ? 'On' : 'Off'}
          </span>
        ),
      },
      {
        key: 'voicemail',
        header: 'Voicemail',
        sortable: true,
        sortValue: (r) => (r.voicemailEnabled ? 'On' : 'Off'),
        cell: (row) => (
          <span className={row.voicemailEnabled ? 'text-foreground' : 'text-muted-foreground'}>
            {row.voicemailEnabled ? 'On' : 'Off'}
          </span>
        ),
      },
      {
        key: 'lastRegistration',
        header: 'Last Registration',
        sortable: true,
        sortValue: (r) => r.lastRegistrationAt ?? '',
        cell: (row) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatLastReg(row.lastRegistrationAt)}
          </span>
        ),
      },
    ],
    [openConfigure],
  );

  const rowActions = useCallback(
    (row: ExtensionHubRow): ActionItem[] => [
      { id: 'configure', label: 'Configure', onSelect: () => openConfigure(row, 'general') },
      { id: 'sip', label: 'SIP / QR', onSelect: () => openConfigure(row, 'sip') },
      { id: 'desk', label: 'Desk Phone', onSelect: () => openConfigure(row, 'desk') },
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
                      Extensions appear when Platform Admin assigns phone numbers to your
                      tenant. Open Configure on a row to finish employee setup in under two
                      minutes.
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
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
