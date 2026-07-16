'use client';

import {
  ArrowDownAZ,
  ChevronDown,
  Monitor,
  MoreHorizontal,
  Phone,
  Plus,
  QrCode,
  Search,
  Settings,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useExtensionHub,
  useExtensionRestartRegistration,
  useRenameExtensionDisplayName,
  type ConfigureTabId,
  type ExtensionHubRow,
  type ExtensionHubStatus,
} from '../../../lib/hooks/queries/use-extension-hub';
import { useCreateTenantExtension } from '../../../lib/hooks/queries/use-tenant-mutations';
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

type HubFilter = 'all' | 'online' | 'offline' | 'no-device';
type HubSort = 'extension' | 'displayName' | 'registration';

const FILTER_OPTIONS: { id: HubFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'no-device', label: 'Needs Setup' },
];

const SORT_OPTIONS: { id: HubSort; label: string }[] = [
  { id: 'extension', label: 'Extension Number' },
  { id: 'displayName', label: 'Display Name' },
  { id: 'registration', label: 'Registration Status' },
];

const REGISTRATION_SORT: Record<ExtensionHubStatus, number> = {
  RegistrationFailed: 0,
  NoDevice: 1,
  Provisioned: 2,
  Registered: 3,
};

function matchesSearch(row: ExtensionHubRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const did = row.did?.formatted ?? row.did?.number ?? '';
  const digits = did.replace(/\D/g, '');
  const qDigits = q.replace(/\D/g, '');
  return (
    row.extension.toLowerCase().includes(q) ||
    row.displayName.toLowerCase().includes(q) ||
    row.label.toLowerCase().includes(q) ||
    did.toLowerCase().includes(q) ||
    (qDigits.length > 0 && digits.includes(qDigits))
  );
}

function PhoneSetupSlideOver({
  open,
  onClose,
  row,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  row: ExtensionHubRow | null;
  onChoose: (choice: 'mobile' | 'desk') => void;
}) {
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Set Up Phone"
      description={row ? `Connect ${row.label} to a phone` : undefined}
    >
      <p className="mb-4 text-sm text-muted-foreground">Choose how you want to use this extension.</p>
      <div className="space-y-3">
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => onChoose('mobile')}
        >
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="block font-medium">Mobile App</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Scan a QR code to use this extension on your phone.
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => onChoose('desk')}
        >
          <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="block font-medium">Desk Phone</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Set up a phone at your desk or reception area.
            </span>
          </span>
        </button>
      </div>
    </SlideOver>
  );
}

function matchesFilter(row: ExtensionHubRow, filter: HubFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'no-device') {
    // Needs Setup: business config incomplete (API statusLabel) or legacy NoDevice
    return row.statusLabel === 'Needs Setup' || row.status === 'NoDevice';
  }
  if (filter === 'online') return row.onlineStatus === 'Online';
  if (filter === 'offline') {
    return row.onlineStatus === 'Offline' && row.statusLabel !== 'Needs Setup' && row.status !== 'NoDevice';
  }
  return true;
}

function sortRows(rows: ExtensionHubRow[], sort: HubSort): ExtensionHubRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'extension') {
      return a.extension.localeCompare(b.extension, undefined, { numeric: true });
    }
    if (sort === 'displayName') {
      return a.displayName.localeCompare(b.displayName);
    }
    const regDiff = REGISTRATION_SORT[a.status] - REGISTRATION_SORT[b.status];
    if (regDiff !== 0) return regDiff;
    if (a.onlineStatus !== b.onlineStatus) {
      return a.onlineStatus === 'Online' ? 1 : -1;
    }
    return a.extension.localeCompare(b.extension, undefined, { numeric: true });
  });
  return copy;
}

function deviceStatusLabel(row: ExtensionHubRow): string {
  if (row.hasMobileApp && !row.hasDeskPhone) {
    return 'Mobile App Registered';
  }
  if (row.device?.deviceLabel) {
    return row.device.deviceLabel;
  }
  if (row.hasDeskPhone && row.device?.model) {
    const make = row.device.manufacturer ?? '';
    return `${make} ${row.device.model}`.trim();
  }
  if (row.hasMobileApp && row.hasDeskPhone) {
    return row.device?.deviceLabel ?? 'Mobile App Registered';
  }
  return 'No device configured';
}

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

  if (!canWrite) {
    return <span className="text-lg font-semibold">{row.label}</span>;
  }

  return (
    <span className="flex flex-wrap items-baseline gap-0 text-lg font-semibold">
      <span className="font-mono">{row.extension}</span>
      <span className="mx-1.5 text-muted-foreground" aria-hidden="true">
        •
      </span>
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(e.target.value), 600);
        }}
        onBlur={() => commit(value)}
        className="h-8 min-w-[8rem] max-w-xs border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:border-border focus-visible:bg-background"
        aria-label={`Display name for extension ${row.extension}`}
      />
    </span>
  );
}

function ExtensionRowCard({
  row,
  canWrite,
  onConfigure,
  onSetUpPhone,
  onRenamed,
  onRefresh,
  setupSkipped,
  onSkipSetup,
}: {
  row: ExtensionHubRow;
  canWrite: boolean;
  onConfigure: (tab: ConfigureTabId) => void;
  onSetUpPhone: () => void;
  onRenamed: () => void;
  onRefresh: () => void;
  setupSkipped: boolean;
  onSkipSetup: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const restartReg = useExtensionRestartRegistration();

  const showNoDeviceGuide = row.status === 'NoDevice' && !setupSkipped;
  const showNeedsSetupGuide =
    !showNoDeviceGuide && row.statusLabel === 'Needs Setup' && !setupSkipped;
  const deviceLabel = deviceStatusLabel(row);
  const DeviceIcon = row.hasMobileApp && !row.hasDeskPhone ? Smartphone : Monitor;
  const qrActionLabel = row.hasMobileApp ? 'View QR code' : 'Generate QR code';
  const qrActionTitle = row.hasMobileApp
    ? 'View current QR or regenerate'
    : 'Generate a QR code for the mobile app';

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const openCallHistory = () => {
    window.location.href = `/reports/cdr?extension=${encodeURIComponent(row.extension)}`;
  };

  return (
    <article
      className="rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/20 sm:p-5"
      aria-label={`Extension ${row.label}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <InlineDisplayName row={row} canWrite={canWrite} onRenamed={onRenamed} />

          <dl className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="sr-only">Phone number</dt>
                <dd className={row.did ? 'font-mono font-medium' : 'text-muted-foreground'}>
                  {row.did?.formatted ?? 'No phone number assigned'}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <DeviceIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="sr-only">Device</dt>
                <dd className={deviceLabel === 'No device configured' ? 'text-muted-foreground' : ''}>
                  {deviceLabel}
                </dd>
              </div>
            </div>

            <div>
              <dt className="sr-only">Registration status</dt>
              <dd>
                <ExtensionStatusChip
                  status={row.status}
                  onlineStatus={row.onlineStatus}
                  statusLabel={row.statusLabel}
                />
              </dd>
            </div>

            <div className="text-muted-foreground">
              <dt className="sr-only">Last activity</dt>
              <dd>
                {row.lastCallRelative ? (
                  <>
                    Last call <span className="text-foreground">{row.lastCallRelative}</span>
                  </>
                ) : (
                  'No calls yet'
                )}
              </dd>
            </div>
          </dl>

          {showNoDeviceGuide ? (
            <div
              className="rounded-xl border border-dashed border-border bg-muted/20 p-4"
              role="region"
              aria-label="Phone setup guidance"
            >
              <p className="text-sm text-muted-foreground">
                This extension isn&apos;t connected to a phone yet.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={onSetUpPhone}
                  aria-label={`Set up phone for ${row.label}`}
                >
                  Set Up Phone
                </Button>
                <Button size="sm" variant="ghost" onClick={onSkipSetup} aria-label="Skip setup for now">
                  Skip
                </Button>
              </div>
            </div>
          ) : null}

          {showNeedsSetupGuide ? (
            <div
              className="rounded-xl border border-dashed border-border bg-muted/20 p-4"
              role="region"
              aria-label="Configuration guidance"
            >
              <p className="text-sm text-muted-foreground">
                Ready to configure — set the display name, user, and voicemail PIN.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => onConfigure('general')}
                  aria-label={`Configure ${row.label}`}
                >
                  Configure
                </Button>
                <Button size="sm" variant="ghost" onClick={onSkipSetup} aria-label="Skip setup for now">
                  Skip
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
          <Button
            size="sm"
            onClick={() => onConfigure('overview')}
            aria-label={`Configure ${row.label}`}
            title="Configure extension settings"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Configure
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConfigure('mobile')}
            aria-label={`${qrActionLabel} for ${row.label}`}
            title={qrActionTitle}
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            QR
          </Button>
          <div className="relative" ref={menuRef}>
            <Button
              ref={menuButtonRef}
              size="sm"
              variant="outline"
              aria-label={`More actions for ${row.label}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="More actions"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              More
            </Button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Close menu"
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-10 z-20 min-w-[220px] rounded-xl border border-border bg-background p-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                    onClick={() => {
                      setMenuOpen(false);
                      openCallHistory();
                    }}
                  >
                    Call History
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                    onClick={() => {
                      setMenuOpen(false);
                      void restartReg.mutateAsync(row.id).then(onRefresh);
                    }}
                  >
                    Restart Registration
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled
                    title="Archive will be available in a future update"
                    className="block w-full cursor-not-allowed rounded-lg px-3 py-2 text-left text-sm text-muted-foreground opacity-60"
                  >
                    Archive
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ExtensionsHubContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_EXTENSIONS_WRITE);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HubFilter>('all');
  const [sort, setSort] = useState<HubSort>('extension');
  const [createOpen, setCreateOpen] = useState(false);
  const [newExtension, setNewExtension] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [configureRow, setConfigureRow] = useState<ExtensionHubRow | null>(null);
  const [configureTab, setConfigureTab] = useState<ConfigureTabId>('overview');
  const [setupChooserRow, setSetupChooserRow] = useState<ExtensionHubRow | null>(null);
  const [skippedSetupIds, setSkippedSetupIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const query = useExtensionHub();
  const create = useCreateTenantExtension();

  const rows = useMemo(() => {
    const all = query.data ?? [];
    const filtered = all.filter((row) => matchesSearch(row, search) && matchesFilter(row, filter));
    return sortRows(filtered, sort);
  }, [query.data, search, filter, sort]);

  const openConfigure = useCallback((row: ExtensionHubRow, tab: ConfigureTabId) => {
    setConfigureTab(tab);
    setConfigureRow(row);
  }, []);

  const handleSetupChoice = useCallback(
    (choice: 'mobile' | 'desk') => {
      if (!setupChooserRow) return;
      setSetupChooserRow(null);
      openConfigure(setupChooserRow, choice === 'mobile' ? 'mobile' : 'desk');
    },
    [openConfigure, setupChooserRow],
  );

  const skipSetup = useCallback((id: string) => {
    setSkippedSetupIds((prev) => new Set(prev).add(id));
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
              'See which extensions are ready, which need attention, and what to do next.'
            }
            actions={
              canWrite ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Extension
                </Button>
              ) : null
            }
          />

          <ExtensionHubStats />

          <div className="mb-4 space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative max-w-md flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  placeholder="Search extensions, names, or phone numbers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search extensions"
                />
              </div>
              <div className="flex items-center gap-2">
                <ArrowDownAZ className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <label className="sr-only" htmlFor="extension-sort">
                  Sort extensions
                </label>
                <div className="relative">
                  <select
                    id="extension-sort"
                    className="h-9 appearance-none rounded-xl border border-border bg-background py-1 pl-3 pr-8 text-sm"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as HubSort)}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={query.isFetching}>
                  Refresh
                </Button>
              </div>
            </div>

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter extensions by registration status"
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
                {query.data?.length ? (
                  <>
                    <p className="mb-2 font-medium text-foreground">No extensions match your filters.</p>
                    <p>Try a different search term or filter.</p>
                  </>
                ) : (
                  <>
                    <p className="mb-2 font-medium text-foreground">No extensions yet.</p>
                    <p>
                      When Platform Admin assigns phone numbers, extensions are provisioned
                      automatically and appear here ready to configure.
                    </p>
                  </>
                )}
              </div>
            }
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-2xl" />
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
                  onSetUpPhone={() => setSetupChooserRow(row)}
                  onRenamed={refresh}
                  onRefresh={refresh}
                  setupSkipped={skippedSetupIds.has(row.id)}
                  onSkipSetup={() => skipSetup(row.id)}
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
              <p className="text-sm text-muted-foreground">
                Additional internal extension (no phone number required). Platform-provisioned numbers
                already create extensions automatically.
              </p>
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

          <PhoneSetupSlideOver
            open={Boolean(setupChooserRow)}
            onClose={() => setSetupChooserRow(null)}
            row={setupChooserRow}
            onChoose={handleSetupChoice}
          />

          <ExtensionConfigureDrawer
            open={Boolean(configureRow)}
            onClose={() => setConfigureRow(null)}
            row={configureRow}
            initialTab={configureTab}
            onSaved={refresh}
            onSetUpPhone={() => {
              if (configureRow) setSetupChooserRow(configureRow);
            }}
          />
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
