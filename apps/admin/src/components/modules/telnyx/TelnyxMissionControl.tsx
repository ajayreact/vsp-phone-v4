'use client';

import { motion } from 'framer-motion';
import {
  Download,
  History,
  RefreshCw,
  Search,
  ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { usePortal } from '../../../lib/portal/PortalProvider';
import { usePlatformTenants } from '../../../lib/hooks/queries/use-platform';
import {
  useActivateTelnyxNumber,
  useAssignTelnyxNumber,
  useBulkAssignTelnyxNumbers,
  useBulkReleaseTelnyxNumbers,
  usePurchaseTelnyxNumber,
  useReleaseTelnyxNumber,
  useReserveTelnyxNumber,
  useSearchAvailableNumbers,
  useSuspendTelnyxNumber,
  useTelnyxDashboard,
  useTelnyxNumberHistory,
  useTelnyxNumberRequests,
  useTelnyxNumbers,
  useTelnyxSyncStatus,
  useTriggerTelnyxSync,
  useUpdateTelnyxNumber,
} from '../../../lib/hooks/queries/use-telecom';
import { getModuleById } from '../../../lib/navigation';
import { hasPermission } from '../../../lib/rbac/permissions';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import type { SearchAvailableParams, TelnyxAvailableNumber, TelnyxNumberRecord } from '../../../types/telecom';
import { DataTable, type Column } from '../../data/DataTable';
import { EmptyState } from '../../data/EmptyState';
import { FilterBar } from '../../data/FilterBar';
import { PermissionDenied } from '../../data/PermissionDenied';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Badge, StatusBadge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, CardBody } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { MarketplaceApprovalQueue } from '../marketplace/MarketplaceApprovalQueue';
import { Skeleton } from '../../ui/Skeleton';

const TABS = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'search', label: 'Search & Purchase' },
  { id: 'requests', label: 'Tenant Requests' },
  { id: 'sync', label: 'Synchronization' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const inventoryColumns: Column<TelnyxNumberRecord>[] = [
  { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono text-sm font-medium">{r.number}</span> },
  { key: 'region', header: 'Region', cell: (r) => r.region },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.assignedTenantName ?? <span className="text-muted-foreground">Available</span> },
  { key: 'ext', header: 'Extension', cell: (r) => r.assignedExtension ?? '—' },
  { key: 'sms', header: 'SMS', cell: (r) => (r.smsEnabled ? '✓' : '—') },
  { key: 'e911', header: 'E911', cell: (r) => (r.emergencyEnabled ? '✓' : '—') },
  { key: 'cost', header: 'Cost/mo', cell: (r) => <span className="tabular-nums">${r.monthlyCost.toFixed(2)}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'available' ? 'active' : r.status === 'active' ? 'online' : 'pending'} /> },
];

function exportCsv(rows: TelnyxNumberRecord[]) {
  const header = ['number', 'region', 'status', 'tenant', 'extension', 'sms', 'mms', 'e911', 'monthlyCost'];
  const lines = rows.map((r) =>
    [r.number, r.region, r.status, r.assignedTenantName ?? '', r.assignedExtension ?? '', r.smsEnabled, r.mmsEnabled, r.emergencyEnabled, r.monthlyCost].join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `telnyx-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TelnyxMissionControl() {
  const portal = usePortal();
  const module = getModuleById('telnyx-numbers', portal);
  const permissions = usePermissions();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'inventory';
  const [tab, setTab] = useState<TabId>(initialTab);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [region, setRegion] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<TelnyxNumberRecord | null>(null);

  const dashboard = useTelnyxDashboard();
  const syncStatus = useTelnyxSyncStatus();
  const triggerSync = useTriggerTelnyxSync();
  const inventoryQuery = useTelnyxNumbers({ search, status: filter, region });
  const requestsQuery = useTelnyxNumberRequests('PENDING');
  const tenantsQuery = usePlatformTenants();

  const rows = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data]);

  if (!module) {
    return (
      <PageContainer>
        <EmptyState
          title="Telnyx Numbers unavailable"
          description="This module is only available on the Platform Admin portal (admin.vspphone.com)."
        />
      </PageContainer>
    );
  }

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="Telnyx Mission Control"
          description="Production number inventory, search, purchase, assignment, and tenant marketplace workflows."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void triggerSync.mutate()} disabled={triggerSync.isPending}>
                <RefreshCw className={`h-4 w-4 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportCsv(selectedIds.length ? rows.filter((r) => selectedIds.includes(r.id)) : rows)}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          }
        />

        <DashboardCards query={dashboard} />

        <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {t.id === 'requests' && (requestsQuery.data?.length ?? 0) > 0 ? (
                <Badge className="ml-2" variant="outline">{requestsQuery.data?.length}</Badge>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'inventory' ? (
          <InventoryTab
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            region={region}
            setRegion={setRegion}
            query={inventoryQuery}
            rows={rows}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onOpenDetail={setDetail}
            tenants={tenantsQuery.data ?? []}
          />
        ) : null}

        {tab === 'search' ? <SearchPurchaseTab onPurchased={() => setTab('inventory')} /> : null}
        {tab === 'requests' ? <MarketplaceApprovalQueue /> : null}
        {tab === 'sync' ? <SyncTab status={syncStatus} onSync={() => void triggerSync.mutate()} syncing={triggerSync.isPending} /> : null}
      </motion.div>

      {detail ? <NumberDetailDrawer number={detail} onClose={() => setDetail(null)} tenants={tenantsQuery.data ?? []} /> : null}
    </PageContainer>
  );
}

function DashboardCards({ query }: { query: ReturnType<typeof useTelnyxDashboard> }) {
  const stats = query.data;
  const cards = stats
    ? [
        { label: 'Total', value: stats.totalNumbers },
        { label: 'Assigned', value: stats.assigned },
        { label: 'Available', value: stats.available },
        { label: 'Reserved', value: stats.reserved },
        { label: 'Pending Port', value: stats.pendingPort },
        { label: 'Porting', value: stats.porting },
        { label: 'Released', value: stats.released },
        { label: 'SMS', value: stats.smsEnabled },
        { label: 'Voice', value: stats.voiceEnabled },
        { label: 'E911', value: stats.emergencyEnabled },
        { label: 'Monthly Cost', value: `$${stats.monthlyCost.toFixed(0)}` },
        { label: 'Inventory Value', value: `$${stats.inventoryValue.toFixed(0)}` },
      ]
    : [];

  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={() => void query.refetch()} skeleton={<Skeleton className="mb-6 h-24 w-full rounded-2xl" />}>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card">
            <CardBody className="py-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-lg font-semibold tabular-nums">{c.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </QueryState>
  );
}

function InventoryTab({
  search,
  setSearch,
  filter,
  setFilter,
  region,
  setRegion,
  query,
  rows,
  selectedIds,
  setSelectedIds,
  onOpenDetail,
  tenants,
}: {
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  query: ReturnType<typeof useTelnyxNumbers>;
  rows: TelnyxNumberRecord[];
  selectedIds: string[];
  setSelectedIds: (v: string[]) => void;
  onOpenDetail: (n: TelnyxNumberRecord) => void;
  tenants: Array<{ id: string; name: string; displayName?: string }>;
}) {
  const [bulkTenantId, setBulkTenantId] = useState('');
  const bulkAssign = useBulkAssignTelnyxNumbers();
  const bulkRelease = useBulkReleaseTelnyxNumbers();

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative max-w-lg flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search numbers, tenants, tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Input className="max-w-[140px]" placeholder="Region" value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <FilterBar
          filters={[
            { id: 'all', label: 'All' },
            { id: 'available', label: 'Available' },
            { id: 'active', label: 'Assigned' },
            { id: 'porting', label: 'Porting' },
            { id: 'suspended', label: 'Suspended' },
          ]}
          active={filter}
          onChange={setFilter}
        />
      </div>

      {selectedIds.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <span>{selectedIds.length} selected</span>
          <select className="h-8 rounded-lg border border-border bg-background px-2 text-sm" value={bulkTenantId} onChange={(e) => setBulkTenantId(e.target.value)}>
            <option value="">Select tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.displayName || t.name}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={!bulkTenantId || bulkAssign.isPending} onClick={() => bulkAssign.mutate({ ids: selectedIds, tenantId: bulkTenantId }, { onSuccess: () => setSelectedIds([]) })}>
            Bulk Assign
          </Button>
          <Button size="sm" variant="outline" disabled={bulkRelease.isPending} onClick={() => bulkRelease.mutate(selectedIds, { onSuccess: () => setSelectedIds([]) })}>
            Bulk Release
          </Button>
        </div>
      ) : null}

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!rows.length}
        empty={<EmptyState title="No numbers in inventory" description="Search and purchase numbers from Telnyx, or run a sync." action={<Link href="?tab=search"><Button><ShoppingCart className="h-4 w-4" />Search Numbers</Button></Link>} />}
        skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
      >
        <DataTable
          columns={inventoryColumns}
          data={rows}
          pageSize={20}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={(row) => [{ id: 'view', label: 'Manage', onSelect: () => onOpenDetail(row) }]}
        />
      </QueryState>
    </>
  );
}

function SearchPurchaseTab({ onPurchased }: { onPurchased: () => void }) {
  const [filters, setFilters] = useState<SearchAvailableParams>({ countryCode: 'US', limit: 50 });
  const [selected, setSelected] = useState<TelnyxAvailableNumber | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchQuery = useSearchAvailableNumbers(filters, hasSearched);

  const runSearch = () => {
    setHasSearched(true);
    void searchQuery.refetch();
  };

  const reserve = useReserveTelnyxNumber();
  const purchase = usePurchaseTelnyxNumber();

  const workflow = async (action: 'reserve' | 'purchase') => {
    if (!selected) return;
    try {
      if (action === 'reserve') {
        const res = await reserve.mutateAsync({ phoneNumber: selected.phoneNumber, countryCode: filters.countryCode });
        setReservationId(res.id);
      } else {
        await purchase.mutateAsync({
          phoneNumber: selected.phoneNumber,
          countryCode: filters.countryCode,
          reservationId: reservationId ?? undefined,
        });
        setSelected(null);
        setReservationId(null);
        onPurchased();
      }
    } catch {
      /* error shown in UI */
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="glass-card lg:col-span-1">
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold">Search Filters</p>
          <Input placeholder="Country" value={filters.countryCode ?? ''} onChange={(e) => setFilters({ ...filters, countryCode: e.target.value })} />
          <Input placeholder="State (e.g. NY)" value={filters.administrativeArea ?? ''} onChange={(e) => setFilters({ ...filters, administrativeArea: e.target.value })} />
          <Input placeholder="City" value={filters.locality ?? ''} onChange={(e) => setFilters({ ...filters, locality: e.target.value })} />
          <Input placeholder="ZIP" value={filters.postalCode ?? ''} onChange={(e) => setFilters({ ...filters, postalCode: e.target.value })} />
          <Input placeholder="Area code" value={filters.areaCode ?? ''} onChange={(e) => setFilters({ ...filters, areaCode: e.target.value })} />
          <Input placeholder="Contains" value={filters.contains ?? ''} onChange={(e) => setFilters({ ...filters, contains: e.target.value })} />
          <Input placeholder="Ends with" value={filters.endsWith ?? ''} onChange={(e) => setFilters({ ...filters, endsWith: e.target.value })} />
          <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={filters.phoneNumberType ?? ''} onChange={(e) => setFilters({ ...filters, phoneNumberType: e.target.value || undefined })}>
            <option value="">Any type</option>
            <option value="local">Local</option>
            <option value="toll_free">Toll Free</option>
            <option value="mobile">Mobile</option>
            <option value="national">National</option>
          </select>
          <div className="flex flex-wrap gap-3 text-sm">
            {(['voice', 'sms', 'mms', 'emergency', 'quickship'] as const).map((f) => (
              <label key={f} className="flex items-center gap-1.5 capitalize">
                <input type="checkbox" checked={Boolean(filters[f])} onChange={(e) => setFilters({ ...filters, [f]: e.target.checked || undefined })} />
                {f}
              </label>
            ))}
          </div>
          <Button className="w-full" onClick={runSearch} disabled={searchQuery.isFetching}>
            <Search className="h-4 w-4" />
            {searchQuery.isFetching ? 'Searching…' : 'Search Live Inventory'}
          </Button>
        </CardBody>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        <QueryState
          isLoading={searchQuery.isLoading}
          isError={searchQuery.isError}
          error={searchQuery.error}
          onRetry={runSearch}
          isEmpty={!searchQuery.data?.length && !searchQuery.isLoading}
          empty={<EmptyState title="No results" description="Adjust filters and search Telnyx live inventory." />}
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Features</th>
                  <th className="px-4 py-3">Cost/mo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(searchQuery.data ?? []).map((n) => (
                  <tr key={n.phoneNumber} className={`border-t border-border ${selected?.phoneNumber === n.phoneNumber ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3 font-mono font-medium">{n.phoneNumber}</td>
                    <td className="px-4 py-3">{n.region}</td>
                    <td className="px-4 py-3">{n.phoneNumberType}</td>
                    <td className="px-4 py-3">{n.features.join(', ')}</td>
                    <td className="px-4 py-3 tabular-nums">${n.monthlyCost.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => setSelected(n)}>Select</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>

        {selected ? (
          <Card className="glass-card">
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-lg font-semibold">{selected.phoneNumber}</p>
                <p className="text-sm text-muted-foreground">${selected.monthlyCost.toFixed(2)}/mo · {selected.features.join(', ')}</p>
                {reservationId ? <p className="mt-1 text-xs text-muted-foreground">Reserved — ready to purchase</p> : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void workflow('reserve')} disabled={reserve.isPending}>
                  {reserve.isPending ? 'Reserving…' : 'Reserve'}
                </Button>
                <Button onClick={() => void workflow('purchase')} disabled={purchase.isPending}>
                  {purchase.isPending ? 'Purchasing…' : 'Purchase'}
                </Button>
              </div>
              {(reserve.isError || purchase.isError) ? (
                <p className="w-full text-sm text-destructive">{(reserve.error ?? purchase.error)?.message}</p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function SyncTab({
  status,
  onSync,
  syncing,
}: {
  status: ReturnType<typeof useTelnyxSyncStatus>;
  onSync: () => void;
  syncing: boolean;
}) {
  const s = status.data;
  return (
    <Card className="glass-card max-w-2xl">
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Inventory Synchronization</p>
          <Button size="sm" onClick={onSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Manual Sync
          </Button>
        </div>
        <QueryState isLoading={status.isLoading} isError={status.isError} error={status.error} onRetry={() => void status.refetch()} skeleton={<Skeleton className="h-32 w-full rounded-xl" />}>
          {s ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize">{s.status}</dd></div>
              <div><dt className="text-muted-foreground">Last sync</dt><dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'Never'}</dd></div>
              <div><dt className="text-muted-foreground">Added</dt><dd>{s.added}</dd></div>
              <div><dt className="text-muted-foreground">Updated</dt><dd>{s.updated}</dd></div>
              <div><dt className="text-muted-foreground">Failed</dt><dd>{s.failed}</dd></div>
              <div><dt className="text-muted-foreground">Conflicts</dt><dd>{s.conflicts}</dd></div>
              {s.lastError ? <div className="col-span-2 text-destructive">{s.lastError}</div> : null}
            </dl>
          ) : null}
        </QueryState>
        <p className="text-xs text-muted-foreground">Inventory syncs automatically when listing numbers. Conflicts indicate numbers in the database not found on Telnyx.</p>
      </CardBody>
    </Card>
  );
}

function NumberDetailDrawer({
  number,
  onClose,
  tenants,
}: {
  number: TelnyxNumberRecord;
  onClose: () => void;
  tenants: Array<{ id: string; name: string; displayName?: string }>;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'assign' | 'carrier' | 'history'>('details');
  const [tenantId, setTenantId] = useState(number.assignedTenantId ?? '');
  const [extension, setExtension] = useState(number.assignedExtension ?? '');
  const [department, setDepartment] = useState('');
  const [queue, setQueue] = useState('');
  const [ivr, setIvr] = useState('');
  const [ringGroup, setRingGroup] = useState('');
  const [voicemail, setVoicemail] = useState('');
  const [conference, setConference] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [notes, setNotes] = useState(number.notes ?? '');
  const [tags, setTags] = useState((number.tags ?? []).join(', '));
  const history = useTelnyxNumberHistory(number.id);
  const assign = useAssignTelnyxNumber();
  const update = useUpdateTelnyxNumber();
  const release = useReleaseTelnyxNumber();
  const suspend = useSuspendTelnyxNumber();
  const activate = useActivateTelnyxNumber();

  return (
    <SlideOver
      open
      onClose={onClose}
      title={number.number}
      description={`Telnyx Mission Control · ${number.status}`}
      width="lg"
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {number.status === 'suspended' ? (
              <Button variant="outline" size="sm" onClick={() => activate.mutate(number.id)}>Activate</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => suspend.mutate(number.id)}>Suspend</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => release.mutate(number.id, { onSuccess: onClose })}>Release</Button>
          </div>
          {activeTab === 'assign' ? (
            <Button disabled={!tenantId || assign.isPending} onClick={() => assign.mutate({ id: number.id, payload: { tenantId, extension: extension || undefined, department: department || undefined, queue: queue || undefined, ivr: ivr || undefined, ringGroup: ringGroup || undefined, voicemail: voicemail || undefined, conference: conference || undefined, forwardTo: forwardTo || undefined } }, { onSuccess: onClose })}>
              {assign.isPending ? 'Saving…' : 'Assign'}
            </Button>
          ) : activeTab === 'details' ? (
            <Button onClick={() => update.mutate({ id: number.id, payload: { notes, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) } })}>
              Save Settings
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex gap-2 border-b border-border pb-2">
        {(['details', 'assign', 'carrier', 'history'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setActiveTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${activeTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'details' ? (
        <div className="space-y-4 text-sm">
          <label className="block space-y-1">Notes<textarea className="min-h-[80px] w-full rounded-xl border border-border bg-background p-3" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="block space-y-1">Tags (comma-separated)<Input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        </div>
      ) : null}

      {activeTab === 'assign' ? (
        <div className="space-y-4">
          <label className="block space-y-1 text-sm"><span className="font-medium">Tenant</span>
            <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Select tenant…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.displayName || t.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Extension</span><Input value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="101" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Department</span><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Sales" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Queue</span><Input value={queue} onChange={(e) => setQueue(e.target.value)} placeholder="support-queue" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">IVR</span><Input value={ivr} onChange={(e) => setIvr(e.target.value)} placeholder="main-menu" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Ring Group</span><Input value={ringGroup} onChange={(e) => setRingGroup(e.target.value)} placeholder="front-desk" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Voicemail</span><Input value={voicemail} onChange={(e) => setVoicemail(e.target.value)} placeholder="vm-box-101" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Conference</span><Input value={conference} onChange={(e) => setConference(e.target.value)} placeholder="conf-bridge" /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Forward To</span><Input value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} placeholder="+15551234567 or SIP URI" /></label>
        </div>
      ) : null}

      {activeTab === 'carrier' ? (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {[['Carrier', 'Telnyx'], ['Connection', number.connectionType ?? '—'], ['Voice Profile', number.voiceProfile ?? '—'], ['Messaging', number.messagingProfile ?? '—'], ['E911', number.emergencyEnabled ? 'Enabled' : 'No'], ['Monthly Cost', `$${number.monthlyCost.toFixed(2)}`]].map(([k, v]) => (
            <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      ) : null}

      {activeTab === 'history' ? (
        <QueryState isLoading={history.isLoading} isError={history.isError} error={history.error} onRetry={() => void history.refetch()} skeleton={<Skeleton className="h-32 w-full rounded-xl" />}>
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-2 flex items-center gap-2 font-semibold"><History className="h-4 w-4" /> Assignments</p>
              {(history.data?.assignments ?? []).length ? (
                <ul className="space-y-2">
                  {history.data!.assignments.map((a) => (
                    <li key={a.id} className="rounded-lg border border-border px-3 py-2">
                      {a.tenantName} · {new Date(a.effectiveFrom).toLocaleDateString()}
                      {a.effectiveTo ? ` → ${new Date(a.effectiveTo).toLocaleDateString()}` : ' (current)'}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground">No assignment history.</p>}
            </div>
            <div>
              <p className="mb-2 font-semibold">Audit Trail</p>
              {(history.data?.audit ?? []).length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {history.data!.audit.map((a) => (
                    <li key={a.auditId}>{new Date(a.ts).toLocaleString()} — {a.action}</li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground">No audit entries.</p>}
            </div>
          </div>
        </QueryState>
      ) : null}
    </SlideOver>
  );
}
