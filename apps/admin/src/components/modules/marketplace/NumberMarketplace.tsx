'use client';

import { motion } from 'framer-motion';
import {
  Bell,
  Clock,
  Heart,
  History,
  Phone,
  Search,
  ShoppingBag,
  Star,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useCancelMarketplaceReservation,
  useCancelNumberRequest,
  useCreateNumberRequest,
  useDuplicateNumberRequest,
  useMarketplaceDashboard,
  useMarketplaceFavorites,
  useMarketplaceInventory,
  useMarketplaceNotifications,
  useMarketplaceSavedSearches,
  useReserveMarketplaceNumber,
  useTenantNumberRequestsList,
  useToggleFavorite,
} from '../../../lib/hooks/queries/use-marketplace';
import { useTenantDids } from '../../../lib/hooks/queries/use-tenant';
import { getModuleById } from '../../../lib/navigation';
import { hasPermission } from '../../../lib/rbac/permissions';
import { usePermissions } from '../../../lib/auth/AuthProvider';
import type { MarketplaceNumber, MarketplaceSearchParams, TenantNumberRequest } from '../../../types/marketplace';
import { DataTable, type Column } from '../../data/DataTable';
import { EmptyState } from '../../data/EmptyState';
import { PermissionDenied } from '../../data/PermissionDenied';
import { QueryState } from '../../feedback/QueryState';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Badge, StatusBadge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, CardBody } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { Skeleton } from '../../ui/Skeleton';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'browse', label: 'Available Numbers' },
  { id: 'my-numbers', label: 'My Numbers' },
  { id: 'pending', label: 'Pending Requests' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'history', label: 'History' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'activity', label: 'Activity' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function ReservationCountdown({ expiresAt }: { expiresAt: string }) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return <span className="text-destructive text-xs">Expired</span>;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return (
    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <Clock className="h-3 w-3" />
      {hours}h {mins}m left
    </span>
  );
}

export function NumberMarketplace() {
  const module = getModuleById('dids')!;
  const permissions = usePermissions();
  const [tab, setTab] = useState<TabId>('dashboard');
  const [selected, setSelected] = useState<MarketplaceNumber | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compare, setCompare] = useState<MarketplaceNumber[]>([]);

  const dashboard = useMarketplaceDashboard();
  const pendingQuery = useTenantNumberRequestsList('PENDING');
  const rejectedQuery = useTenantNumberRequestsList('REJECTED');
  const historyQuery = useTenantNumberRequestsList();
  const notifications = useMarketplaceNotifications();

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  const pendingCount = pendingQuery.data?.length ?? 0;
  const unreadCount = (notifications.data ?? []).filter((n) => !n.read).length;

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="Number Marketplace"
          description="Browse platform inventory, reserve numbers, and track requests — no direct carrier access."
        />

        <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {t.id === 'pending' && pendingCount > 0 ? <Badge className="ml-2" variant="outline">{pendingCount}</Badge> : null}
              {t.id === 'activity' && unreadCount > 0 ? <Badge className="ml-2" variant="outline">{unreadCount}</Badge> : null}
            </button>
          ))}
        </div>

        {tab === 'dashboard' ? <DashboardTab query={dashboard} onBrowse={() => setTab('browse')} /> : null}
        {tab === 'browse' ? (
          <BrowseTab
            selected={selected}
            onSelect={(n) => { setSelected(n); setDrawerOpen(true); }}
            compare={compare}
            onCompareToggle={(n) => setCompare((prev) => prev.some((x) => x.id === n.id) ? prev.filter((x) => x.id !== n.id) : prev.length < 3 ? [...prev, n] : prev)}
          />
        ) : null}
        {tab === 'my-numbers' ? <MyNumbersTab /> : null}
        {tab === 'pending' ? <RequestsTab query={pendingQuery} emptyTitle="No pending requests" /> : null}
        {tab === 'rejected' ? <RequestsTab query={rejectedQuery} emptyTitle="No rejected requests" showDuplicate /> : null}
        {tab === 'history' ? <RequestsTab query={historyQuery} emptyTitle="No request history" showDuplicate /> : null}
        {tab === 'favorites' ? <FavoritesTab onSelect={(n) => { setSelected(n); setDrawerOpen(true); setTab('browse'); }} /> : null}
        {tab === 'activity' ? <ActivityTab query={notifications} /> : null}
      </motion.div>

      {drawerOpen && selected ? (
        <NumberDetailDrawer
          number={selected}
          onClose={() => { setDrawerOpen(false); setSelected(null); }}
        />
      ) : null}

      {compare.length > 0 ? (
        <CompareDrawer numbers={compare} onClose={() => setCompare([])} onRemove={(id) => setCompare((p) => p.filter((n) => n.id !== id))} />
      ) : null}
    </PageContainer>
  );
}

function DashboardTab({ query, onBrowse }: { query: ReturnType<typeof useMarketplaceDashboard>; onBrowse: () => void }) {
  const stats = query.data;
  const cards = stats
    ? [
        { label: 'My Numbers', value: stats.myNumbers },
        { label: 'Available', value: stats.availableNumbers },
        { label: 'Pending Requests', value: stats.pendingRequests },
        { label: 'Active Reservations', value: stats.activeReservations },
        { label: 'Rejected', value: stats.rejectedRequests },
      ]
    : [];

  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={() => void query.refetch()} skeleton={<Skeleton className="h-48 w-full rounded-2xl" />}>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card">
            <CardBody className="py-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="glass-card mb-6">
        <CardBody>
          <div className="flex items-center justify-between">
            <p className="font-semibold">Recently Assigned</p>
            <Button size="sm" variant="outline" onClick={onBrowse}><ShoppingBag className="h-4 w-4" />Browse Numbers</Button>
          </div>
          {(stats?.recentlyAssigned ?? []).length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {stats!.recentlyAssigned.map((a) => (
                <li key={a.id} className="flex justify-between rounded-lg border border-border px-3 py-2">
                  <span className="font-mono font-medium">{a.number}</span>
                  <span className="text-muted-foreground">{new Date(a.assignedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No recent assignments.</p>
          )}
        </CardBody>
      </Card>
    </QueryState>
  );
}

function BrowseTab({
  selected,
  onSelect,
  compare,
  onCompareToggle,
}: {
  selected: MarketplaceNumber | null;
  onSelect: (n: MarketplaceNumber) => void;
  compare: MarketplaceNumber[];
  onCompareToggle: (n: MarketplaceNumber) => void;
}) {
  const [filters, setFilters] = useState<MarketplaceSearchParams>({ limit: 100 });
  const [hasSearched, setHasSearched] = useState(true);
  const query = useMarketplaceInventory(filters, hasSearched);
  const favorites = useMarketplaceFavorites();
  const savedSearches = useMarketplaceSavedSearches();
  const favoriteSet = useMemo(() => new Set((favorites.data ?? []).map((f) => f.phoneNumber)), [favorites.data]);
  const toggleFavorite = useToggleFavorite();

  const runSearch = () => {
    setHasSearched(true);
    void query.refetch();
  };

  const columns: Column<MarketplaceNumber>[] = [
    { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono font-medium">{r.number}</span> },
    { key: 'region', header: 'Region', cell: (r) => r.region },
    { key: 'type', header: 'Type', cell: (r) => r.phoneNumberType ?? 'local' },
    { key: 'caps', header: 'Capabilities', cell: (r) => (
      <span className="flex flex-wrap gap-1">
        <Badge variant="outline">Voice</Badge>
        {r.smsEnabled ? <Badge variant="outline">SMS</Badge> : null}
        {r.mmsEnabled ? <Badge variant="outline">MMS</Badge> : null}
        {r.emergencyEnabled ? <Badge variant="outline">E911</Badge> : null}
      </span>
    ) },
    { key: 'cost', header: 'Monthly', cell: (r) => <span className="tabular-nums">${r.monthlyCost.toFixed(2)}</span> },
    { key: 'status', header: 'Availability', cell: (r) => (
      <div>
        <StatusBadge status={r.reservationStatus === 'available' ? 'active' : r.reservationStatus === 'reserved_by_you' ? 'online' : 'pending'} />
        {r.reservationExpiresAt ? <div className="mt-1"><ReservationCountdown expiresAt={r.reservationExpiresAt} /></div> : null}
      </div>
    ) },
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => toggleFavorite.mutate({ phoneNumber: r.number, favorited: favoriteSet.has(r.number) })}>
          <Heart className={`h-3 w-3 ${favoriteSet.has(r.number) ? 'fill-current text-red-500' : ''}`} />
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCompareToggle(r)} disabled={compare.length >= 3 && !compare.some((x) => x.id === r.id)}>Compare</Button>
        <Button size="sm" onClick={() => onSelect(r)} disabled={r.reservationStatus === 'reserved'}>Select</Button>
      </div>
    ) },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <Card className="glass-card lg:col-span-1">
        <CardBody className="space-y-3">
          <p className="text-sm font-semibold">Search Filters</p>
          <Input placeholder="Search" value={filters.search ?? ''} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <Input placeholder="Country" value={filters.countryCode ?? ''} onChange={(e) => setFilters({ ...filters, countryCode: e.target.value })} />
          <Input placeholder="State" value={filters.state ?? ''} onChange={(e) => setFilters({ ...filters, state: e.target.value })} />
          <Input placeholder="City" value={filters.city ?? ''} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
          <Input placeholder="ZIP" value={filters.postalCode ?? ''} onChange={(e) => setFilters({ ...filters, postalCode: e.target.value })} />
          <Input placeholder="Area code" value={filters.areaCode ?? ''} onChange={(e) => setFilters({ ...filters, areaCode: e.target.value })} />
          <Input placeholder="Prefix" value={filters.prefix ?? ''} onChange={(e) => setFilters({ ...filters, prefix: e.target.value })} />
          <Input placeholder="Contains" value={filters.contains ?? ''} onChange={(e) => setFilters({ ...filters, contains: e.target.value })} />
          <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={filters.phoneNumberType ?? ''} onChange={(e) => setFilters({ ...filters, phoneNumberType: e.target.value || undefined })}>
            <option value="">Any type</option>
            <option value="local">Local</option>
            <option value="toll_free">Toll Free</option>
            <option value="mobile">Mobile</option>
          </select>
          <div className="flex flex-wrap gap-2 text-xs">
            {(['voice', 'sms', 'mms', 'emergency', 'vanity'] as const).map((f) => (
              <label key={f} className="flex items-center gap-1 capitalize">
                <input type="checkbox" checked={Boolean(filters[f])} onChange={(e) => setFilters({ ...filters, [f]: e.target.checked || undefined })} />
                {f}
              </label>
            ))}
          </div>
          <Button className="w-full" onClick={runSearch} disabled={query.isFetching}>
            <Search className="h-4 w-4" />
            {query.isFetching ? 'Searching…' : 'Search Inventory'}
          </Button>
          {(savedSearches.data ?? []).length > 0 ? (
            <div className="pt-2 border-t border-border">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Saved Searches</p>
              {(savedSearches.data ?? []).slice(0, 5).map((s) => (
                <button key={s.id} type="button" className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => { setFilters(s.filters as MarketplaceSearchParams); runSearch(); }}>
                  {s.name}
                </button>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="lg:col-span-3">
        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={runSearch}
          isEmpty={!query.data?.length}
          empty={<EmptyState title="No numbers available" description="Adjust filters or check back when platform inventory is replenished." />}
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <DataTable columns={columns} data={query.data ?? []} pageSize={15} />
        </QueryState>
      </div>
    </div>
  );
}

function MyNumbersTab() {
  const query = useTenantDids();
  const rows = (query.data ?? []).map((r) => ({
    id: String(r.id),
    number: String(r.number ?? ''),
    status: String(r.status ?? 'ACTIVE'),
    carrier: String((r.carrier as { name?: string } | undefined)?.name ?? '—'),
  }));

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'number', header: 'Number', cell: (r) => <span className="font-mono font-medium">{r.number}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status="active" /> },
    { key: 'carrier', header: 'Carrier', cell: (r) => r.carrier },
  ];

  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={() => void query.refetch()} isEmpty={!rows.length} empty={<EmptyState title="No assigned numbers" description="Browse the marketplace to request numbers for your tenant." icon={Phone} />} skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <DataTable columns={columns} data={rows} pageSize={20} />
    </QueryState>
  );
}

function RequestsTab({
  query,
  emptyTitle,
  showDuplicate,
}: {
  query: ReturnType<typeof useTenantNumberRequestsList>;
  emptyTitle: string;
  showDuplicate?: boolean;
}) {
  const cancel = useCancelNumberRequest();
  const duplicate = useDuplicateNumberRequest();

  const columns: Column<TenantNumberRequest>[] = [
    { key: 'number', header: 'Number', cell: (r) => <span className="font-mono font-medium">{r.phoneNumber}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'PENDING' ? 'pending' : r.status === 'REJECTED' ? 'offline' : 'active'} /> },
    { key: 'priority', header: 'Priority', cell: (r) => r.priority },
    { key: 'date', header: 'Requested', cell: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'expiry', header: 'Reservation', cell: (r) => r.reservationExpiresAt ? <ReservationCountdown expiresAt={r.reservationExpiresAt} /> : '—' },
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex gap-1">
        {r.status === 'PENDING' ? (
          <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Cancel</Button>
        ) : null}
        {showDuplicate ? (
          <Button size="sm" variant="outline" disabled={duplicate.isPending} onClick={() => duplicate.mutate(r.id)}>Duplicate</Button>
        ) : null}
      </div>
    ) },
  ];

  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={() => void query.refetch()} isEmpty={!query.data?.length} empty={<EmptyState title={emptyTitle} description="Your number requests will appear here." icon={History} />} skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <DataTable columns={columns} data={query.data ?? []} pageSize={20} />
    </QueryState>
  );
}

function FavoritesTab({ onSelect }: { onSelect: (n: MarketplaceNumber) => void }) {
  const favorites = useMarketplaceFavorites();
  const inventory = useMarketplaceInventory({ limit: 500 });
  const toggleFavorite = useToggleFavorite();

  const rows = useMemo(() => {
    const favNumbers = new Set((favorites.data ?? []).map((f) => f.phoneNumber));
    return (inventory.data ?? []).filter((n) => favNumbers.has(n.number));
  }, [favorites.data, inventory.data]);

  return (
    <QueryState isLoading={favorites.isLoading || inventory.isLoading} isError={favorites.isError || inventory.isError} error={favorites.error ?? inventory.error} isEmpty={!rows.length} empty={<EmptyState title="No favorites" description="Star numbers while browsing to save them here." icon={Star} />} skeleton={<Skeleton className="h-48 w-full rounded-2xl" />}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((n) => (
          <Card key={n.id} className="glass-card">
            <CardBody className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono font-semibold">{n.number}</p>
                <p className="text-sm text-muted-foreground">${n.monthlyCost.toFixed(2)}/mo · {n.region}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => toggleFavorite.mutate({ phoneNumber: n.number, favorited: true })}><Heart className="h-4 w-4 fill-current text-red-500" /></Button>
                <Button size="sm" onClick={() => onSelect(n)}>Select</Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </QueryState>
  );
}

function ActivityTab({ query }: { query: ReturnType<typeof useMarketplaceNotifications> }) {
  return (
    <QueryState isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={() => void query.refetch()} isEmpty={!query.data?.length} empty={<EmptyState title="No activity" description="Notifications about reservations and requests appear here." icon={Bell} />} skeleton={<Skeleton className="h-48 w-full rounded-2xl" />}>
      <div className="space-y-3">
        {(query.data ?? []).map((n) => (
          <Card key={n.id} className={`glass-card ${n.read ? 'opacity-75' : ''}`}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.read ? <Badge variant="outline">New</Badge> : null}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </QueryState>
  );
}

function NumberDetailDrawer({ number, onClose }: { number: MarketplaceNumber; onClose: () => void }) {
  const [businessReason, setBusinessReason] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('normal');
  const [reservationId, setReservationId] = useState<string | null>(number.reservationId ?? null);
  const reserve = useReserveMarketplaceNumber();
  const cancelReservation = useCancelMarketplaceReservation();
  const submitRequest = useCreateNumberRequest();

  const workflowReserve = async () => {
    const res = await reserve.mutateAsync({ phoneNumber: number.number });
    setReservationId(res.id);
  };

  const workflowSubmit = async () => {
    await submitRequest.mutateAsync({
      phoneNumber: number.number,
      reservationId: reservationId ?? undefined,
      businessReason: businessReason || undefined,
      notes: notes || undefined,
      priority,
      requestedFeatures: [
        ...(number.smsEnabled ? ['sms'] : []),
        ...(number.mmsEnabled ? ['mms'] : []),
        ...(number.emergencyEnabled ? ['emergency'] : []),
        'voice',
      ],
    });
    onClose();
  };

  return (
    <SlideOver open onClose={onClose} title={number.number} description="Reserve, then submit for platform approval." width="md"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {reservationId ? (
            <Button variant="outline" size="sm" onClick={() => cancelReservation.mutate(reservationId, { onSuccess: () => setReservationId(null) })}>Cancel Reservation</Button>
          ) : (
            <Button variant="outline" onClick={() => void workflowReserve()} disabled={reserve.isPending || number.reservationStatus === 'reserved'}>
              {reserve.isPending ? 'Reserving…' : 'Reserve 24h'}
            </Button>
          )}
          <Button onClick={() => void workflowSubmit()} disabled={submitRequest.isPending}>
            {submitRequest.isPending ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      }
    >
      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted-foreground">Region</dt><dd>{number.region}</dd></div>
        <div><dt className="text-muted-foreground">Monthly</dt><dd>${number.monthlyCost.toFixed(2)}</dd></div>
        <div><dt className="text-muted-foreground">Type</dt><dd>{number.phoneNumberType ?? 'local'}</dd></div>
        <div><dt className="text-muted-foreground">Availability</dt><dd>{number.estimatedAvailability ?? 'Immediate'}</dd></div>
      </dl>
      {number.reservationExpiresAt ? <div className="mb-4"><ReservationCountdown expiresAt={number.reservationExpiresAt} /></div> : null}
      <div className="space-y-3">
        <label className="block space-y-1 text-sm"><span className="font-medium">Business reason</span><Input value={businessReason} onChange={(e) => setBusinessReason(e.target.value)} /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">Priority</span>
          <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm"><span className="font-medium">Notes</span><textarea className="min-h-[80px] w-full rounded-xl border border-border bg-background p-3 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      {(reserve.isError || submitRequest.isError) ? (
        <p className="mt-4 text-sm text-destructive">{(reserve.error ?? submitRequest.error)?.message}</p>
      ) : null}
    </SlideOver>
  );
}

function CompareDrawer({ numbers, onClose, onRemove }: { numbers: MarketplaceNumber[]; onClose: () => void; onRemove: (id: string) => void }) {
  return (
    <SlideOver open onClose={onClose} title="Compare Numbers" description={`${numbers.length} selected`} width="lg">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Number</th><th className="p-2">Region</th><th className="p-2">Cost/mo</th><th className="p-2">Capabilities</th><th className="p-2" /></tr></thead>
          <tbody>
            {numbers.map((n) => (
              <tr key={n.id} className="border-t border-border">
                <td className="p-2 font-mono">{n.number}</td>
                <td className="p-2">{n.region}</td>
                <td className="p-2 tabular-nums">${n.monthlyCost.toFixed(2)}</td>
                <td className="p-2">{[n.smsEnabled && 'SMS', n.mmsEnabled && 'MMS', n.emergencyEnabled && 'E911', 'Voice'].filter(Boolean).join(', ')}</td>
                <td className="p-2"><Button size="sm" variant="ghost" onClick={() => onRemove(n.id)}><X className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SlideOver>
  );
}
