'use client';

import { ChevronRight, MoreHorizontal, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useExtensionHub,
  useExtensionRestartRegistration,
  useExtensionUnassignDid,
  useRenameExtensionDisplayName,
  type ConfigureTabId,
  type ExtensionHubRow,
} from '../../../lib/hooks/queries/use-extension-hub';
import {
  useCreateTenantExtension,
  useDeleteTenantExtension,
} from '../../../lib/hooks/queries/use-tenant-mutations';
import { PERMISSIONS } from '../../../lib/rbac/permissions';
import { hasPermission } from '../../../lib/rbac/permissions';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import { formatExtensionLabel } from '../../../lib/extensions/format-extension-label';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { Skeleton } from '../../ui/Skeleton';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { ExtensionConfigureDrawer } from './ExtensionConfigureDrawer';
import { ExtensionHubStats } from './ExtensionHubStats';
import { ExtensionStatusChip } from './ExtensionStatusChip';

function InlineDisplayName({
  row,
  canWrite,
  onRenamed,
}: {
  row: ExtensionHubRow;
  canWrite: boolean;
  onRenamed: () => void;
}) {
  const [value, setValue] = useState(row.displayName);
  const rename = useRenameExtensionDisplayName();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(row.displayName);
  }, [row.displayName, row.id]);

  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === row.displayName) return;
      void rename.mutateAsync({ id: row.id, displayName: trimmed }).then(onRenamed);
    },
    [onRenamed, rename, row.displayName, row.id],
  );

  if (!canWrite) return <span className="text-base font-medium">{row.displayName}</span>;

  return (
    <Input
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(e.target.value), 600);
      }}
      onBlur={() => commit(value)}
      className="h-9 max-w-xs border-transparent bg-transparent px-0 text-base font-medium shadow-none focus-visible:border-border focus-visible:bg-background"
      aria-label={`Display name for ${row.label}`}
    />
  );
}

type QuickAction = {
  label: string;
  action: () => void;
  destructive?: boolean;
};

function ExtensionRowCard({
  row,
  canWrite,
  onConfigure,
  onRenamed,
  onRefresh,
}: {
  row: ExtensionHubRow;
  canWrite: boolean;
  onConfigure: (tab: ConfigureTabId) => void;
  onRenamed: () => void;
  onRefresh: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const remove = useDeleteTenantExtension();
  const unassignDid = useExtensionUnassignDid();
  const restartReg = useExtensionRestartRegistration();

  const actions: QuickAction[] = [
    { label: 'Configure', action: () => onConfigure('general') },
    { label: 'Rename', action: () => onConfigure('general') },
    { label: 'QR Login', action: () => onConfigure('mobile') },
    { label: 'Provision Desk Phone', action: () => onConfigure('desk') },
    { label: 'Assign Number', action: () => onConfigure('phone') },
    ...(row.did
      ? [
          {
            label: 'Remove Number',
            action: () => void unassignDid.mutateAsync(row.id).then(onRefresh),
          },
        ]
      : []),
    {
      label: 'Restart Registration',
      action: () => void restartReg.mutateAsync(row.id).then(onRefresh),
    },
    {
      label: 'View Call History',
      action: () => {
        window.location.href = `/reports/cdr?extension=${encodeURIComponent(row.extension)}`;
      },
    },
    ...(canWrite
      ? [
          {
            label: 'Delete Extension',
            destructive: true,
            action: () => {
              if (confirm(`Delete ${row.label}?`)) {
                void remove.mutateAsync(row.id).then(onRefresh);
              }
            },
          },
        ]
      : []),
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-lg font-semibold">{row.extension}</span>
            <InlineDisplayName row={row} canWrite={canWrite} onRenamed={onRenamed} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono">{row.did?.formatted ?? 'No DID assigned'}</span>
            <span>{row.device?.deviceLabel || 'No device'}</span>
            <span>{row.onlineStatus}</span>
            <span>{row.registrationLabel}</span>
            {row.lastCallRelative ? <span>Last call {row.lastCallRelative}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ExtensionStatusChip
            status={row.status}
            label={row.statusLabel}
            registrationLabel={row.registrationLabel}
            onlineStatus={row.onlineStatus}
          />
          <Button size="sm" onClick={() => onConfigure('general')}>
            Configure
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="relative">
            <Button size="sm" variant="outline" aria-label="More actions" onClick={() => setMenuOpen((v) => !v)}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 z-20 min-w-[200px] rounded-xl border border-border bg-background p-1 shadow-lg">
                  {actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${a.destructive ? 'text-destructive' : ''}`}
                      onClick={() => {
                        setMenuOpen(false);
                        a.action();
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExtensionsHubContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_EXTENSIONS_WRITE);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newExtension, setNewExtension] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [configureRow, setConfigureRow] = useState<ExtensionHubRow | null>(null);
  const [configureTab, setConfigureTab] = useState<ConfigureTabId>('general');
  const [error, setError] = useState<string | null>(null);

  const query = useExtensionHub(search);
  const create = useCreateTenantExtension();

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const openConfigure = useCallback((row: ExtensionHubRow, tab: ConfigureTabId) => {
    setConfigureTab(tab);
    setConfigureRow(row);
  }, []);

  const refresh = useCallback(() => void query.refetch(), [query]);

  const submitCreate = async () => {
    setError(null);
    const ext = newExtension.trim();
    if (!ext) return;
    try {
      await create.mutateAsync({
        extension: ext,
        displayName: newDisplayName.trim() || undefined,
        lineName: newDisplayName.trim() || undefined,
      });
      setCreateOpen(false);
      setNewExtension('');
      setNewDisplayName('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <ModuleAccessGate moduleId="extensions">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title="Extensions"
            description={
              module.description ??
              'Extension-first administration — numbers, devices, and telephony in one place.'
            }
            actions={
              canWrite ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Extension
                </Button>
              ) : null
            }
          />

          <ExtensionHubStats />

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by extension or display name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={query.isFetching}>
              Refresh
            </Button>
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
            isEmpty={!rows.length}
            empty={
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                <p className="mb-2">No extensions yet.</p>
                <p>When Platform Admin assigns numbers with starting extensions, they appear here automatically.</p>
              </div>
            }
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
            }
          >
            <div className="space-y-3">
              {rows.map((row) => (
                <ExtensionRowCard
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  onConfigure={(tab) => openConfigure(row, tab)}
                  onRenamed={refresh}
                  onRefresh={refresh}
                />
              ))}
            </div>
          </QueryState>

          <SlideOver
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            title="Add extension"
            footer={
              <Button onClick={() => void submitCreate()} disabled={create.isPending || !newExtension.trim()}>
                Create
              </Button>
            }
          >
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Extension number</span>
                <Input value={newExtension} onChange={(e) => setNewExtension(e.target.value)} placeholder="104" />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Display name</span>
                <Input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder={
                    newExtension
                      ? formatExtensionLabel(newExtension, `Extension ${newExtension}`)
                      : 'Reception'
                  }
                />
              </label>
            </div>
          </SlideOver>

          <ExtensionConfigureDrawer
            open={Boolean(configureRow)}
            onClose={() => setConfigureRow(null)}
            row={configureRow}
            initialTab={configureTab}
            onSaved={refresh}
          />

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Need legacy views?{' '}
            <Link href="/people/devices" className="underline">
              Devices
            </Link>{' '}
            and{' '}
            <Link href="/phone-numbers/my-numbers" className="underline">
              Phone Numbers
            </Link>{' '}
            show filtered data from the same extensions.
          </p>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
