'use client';

import {
  ArrowRightLeft,
  Clock,
  GripVertical,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  RefreshCw,
  Search,
  Star,
  Users,
  Voicemail,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import {
  useBlfLamps,
  useBlfPanels,
  useContactDirectory,
  useContactFavorites,
  useContactMutations,
  useReceptionActions,
  useReceptionCalls,
  useReceptionDashboard,
  useReceptionParking,
  useSpeedDial,
  useTenantPresence,
} from '../../lib/hooks/queries/use-reception-console';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import type { Column } from '../data/DataTable';
import { DataTable } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { ModuleAccessGate } from './shared/ModuleShell';

type CallRow = Record<string, unknown> & { id: string; platformUuid?: string };

const PRESENCE_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500',
  BUSY: 'bg-amber-500',
  ON_CALL: 'bg-red-500',
  RINGING: 'bg-sky-500 animate-pulse',
  AWAY: 'bg-yellow-500',
  DND: 'bg-rose-600',
  OFFLINE: 'bg-muted-foreground/40',
  OUT_OF_OFFICE: 'bg-purple-500',
  MEETING: 'bg-indigo-500',
  BREAK: 'bg-orange-400',
  LUNCH: 'bg-orange-500',
  VACATION: 'bg-teal-500',
};

function lampColor(state: string) {
  switch (state) {
    case 'ringing':
      return 'border-sky-400 bg-sky-500/20 ring-2 ring-sky-400/50';
    case 'busy':
      return 'border-red-400 bg-red-500/20';
    case 'dnd':
      return 'border-rose-500 bg-rose-500/20';
    case 'offline':
      return 'border-muted bg-muted/30 opacity-60';
    default:
      return 'border-emerald-400/50 bg-emerald-500/10';
  }
}

export function ReceptionConsole() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_RECEPTION_WRITE);
  const canManageContacts = hasPermission(permissions, PERMISSIONS.TENANT_CONTACTS_WRITE);

  const [search, setSearch] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'calls' | 'directory' | 'favorites'>('calls');

  const dashboard = useReceptionDashboard();
  const callsQuery = useReceptionCalls();
  const parkingQuery = useReceptionParking();
  const presenceQuery = useTenantPresence(search || undefined);
  const directoryQuery = useContactDirectory(search || undefined);
  const favoritesQuery = useContactFavorites();
  const speedDialQuery = useSpeedDial();
  const panelsQuery = useBlfPanels(true);
  const actions = useReceptionActions();
  const contactMutations = useContactMutations();

  const panels = panelsQuery.data ?? [];
  const primaryPanelId = String((panels[0] as { id?: string })?.id ?? '');
  const lampsQuery = useBlfLamps(primaryPanelId || undefined);

  const calls = useMemo(
    () =>
      (callsQuery.data ?? []).map((c, i) => ({
        ...c,
        id: String(c.platformUuid ?? c.id ?? i),
      })) as CallRow[],
    [callsQuery.data],
  );

  const parked = parkingQuery.data ?? [];
  const lamps = (lampsQuery.data ?? []) as Array<Record<string, unknown>>;
  const presenceRows = presenceQuery.data ?? [];
  const favorites = favoritesQuery.data ?? [];
  const speedDial = speedDialQuery.data ?? [];
  const directory = directoryQuery.data;

  const callColumns: Column<CallRow>[] = useMemo(
    () => [
      { key: 'from', header: 'Caller', cell: (r) => String(r.fromName ?? r.fromExtension ?? r.caller ?? '—') },
      { key: 'to', header: 'Destination', cell: (r) => String(r.toExtension ?? r.queueName ?? '—') },
      { key: 'state', header: 'State', cell: (r) => <StatusBadge status={String(r.state) === 'ACTIVE' ? 'active' : 'pending'} /> },
      { key: 'hold', header: 'Hold', cell: (r) => (r.onHold ? 'Yes' : '—') },
    ],
    [],
  );

  const runAction = (type: Parameters<typeof actions.mutateAsync>[0]['type'], payload: Record<string, unknown>) => {
    void actions.mutateAsync({ type, payload });
  };

  const dashboardData = dashboard.data as Record<string, unknown> | undefined;

  return (
    <ModuleAccessGate moduleId="reception">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title={module.label}
            description={module.description}
            actions={
              <Button variant="outline" size="sm" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}>
                <RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            }
          />

          <QueryState
            isLoading={dashboard.isLoading}
            isError={dashboard.isError}
            error={dashboard.error}
            skeleton={<Skeleton className="mb-4 h-20 w-full rounded-2xl" />}
          >
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Active Calls" value={Number(dashboardData?.activeCalls ?? 0)} icon={PhoneCall} />
              <MetricCard label="Parked" value={Number(dashboardData?.parkedCalls ?? parked.length)} icon={Pause} />
              <MetricCard label="Queue Waiting" value={Number((dashboardData?.queues as { waiting?: number })?.waiting ?? 0)} icon={Users} />
              <MetricCard label="Available" value={Number((dashboardData?.presenceSummary as Record<string, number>)?.AVAILABLE ?? 0)} icon={Phone} />
            </div>
          </QueryState>

          <div className="grid gap-4 xl:grid-cols-12">
            {/* BLF Panel */}
            <section className="xl:col-span-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">BLF Panel</h2>
                <span className="text-xs text-muted-foreground">{lamps.length} lamps</span>
              </div>
              <QueryState
                isLoading={lampsQuery.isLoading || panelsQuery.isLoading}
                isError={lampsQuery.isError}
                error={lampsQuery.error}
                skeleton={<Skeleton className="h-48 rounded-xl" />}
              >
                {lamps.length === 0 && presenceRows.length === 0 ? (
                  <EmptyState title="No BLF keys" description="Configure a BLF panel or view presence from extensions." icon={Phone} />
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {(lamps.length ? lamps : presenceRows.slice(0, 16)).map((lamp, idx) => {
                      const lineId = String(lamp.lineId ?? '');
                      const name = String(lamp.displayName ?? lamp.lineName ?? `Ext ${idx + 1}`);
                      const ext = String(lamp.extension ?? '—');
                      const state = String(lamp.lampState ?? lamp.status ?? 'idle');
                      return (
                        <button
                          key={lineId || idx}
                          type="button"
                          draggable={canWrite}
                          className={`relative rounded-xl border p-3 text-left transition hover:shadow-md ${lampColor(state)}`}
                          onClick={() => setTransferTarget(ext !== '—' ? ext : lineId)}
                        >
                          <GripVertical className="absolute right-1 top-1 h-3 w-3 text-muted-foreground/50" />
                          <div className={`mb-2 h-2 w-2 rounded-full ${PRESENCE_COLORS[String(lamp.presence ?? lamp.status ?? 'OFFLINE')] ?? 'bg-muted'}`} />
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{ext}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {lamp.ringing ? <span className="text-[10px] text-sky-500">Ring</span> : null}
                            {lamp.forwarded ? <span className="text-[10px] text-amber-500">FWD</span> : null}
                            {lamp.voicemail ? <Voicemail className="h-3 w-3 text-muted-foreground" /> : null}
                            {lamp.pickupAvailable ? <span className="text-[10px] text-emerald-600">Pickup</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </QueryState>
            </section>

            {/* Live calls + controls */}
            <section className="xl:col-span-7 space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap gap-2">
                  {(['calls', 'directory', 'favorites'] as const).map((tab) => (
                    <Button key={tab} size="sm" variant={activePanel === tab ? 'default' : 'outline'} onClick={() => setActivePanel(tab)}>
                      {tab === 'calls' ? 'Live Calls' : tab === 'directory' ? 'Directory' : 'Favorites'}
                    </Button>
                  ))}
                </div>

                {activePanel === 'calls' ? (
                  <QueryState isLoading={callsQuery.isLoading} isError={callsQuery.isError} error={callsQuery.error} skeleton={<Skeleton className="h-40" />}>
                    {calls.length === 0 ? (
                      <EmptyState title="No active calls" description="Incoming and active calls appear here in real time." icon={PhoneCall} />
                    ) : (
                      <DataTable
                        columns={callColumns}
                        data={calls}
                        pageSize={8}
                        selectable={canWrite}
                        selectedIds={selectedCall ? [selectedCall] : []}
                        onSelectionChange={(ids) => setSelectedCall(ids[0] ?? null)}
                      />
                    )}
                  </QueryState>
                ) : null}

                {activePanel === 'directory' ? (
                  <div className="space-y-3">
                    <Input placeholder="Search directory…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <QueryState isLoading={directoryQuery.isLoading} isError={directoryQuery.isError} error={directoryQuery.error} skeleton={<Skeleton className="h-40" />}>
                      <ul className="max-h-64 space-y-1 overflow-y-auto">
                        {(directory?.users ?? []).slice(0, 30).map((u: Record<string, unknown>) => (
                          <li key={String(u.userId)} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50">
                            <div>
                              <p className="text-sm font-medium">{String(u.displayName)}</p>
                              <p className="text-xs text-muted-foreground">
                                {String(((u.lines as Array<{ extension?: string }>) ?? [])[0]?.extension ?? u.email ?? '')}
                              </p>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setTransferTarget(String(((u.lines as Array<{ extension?: string }>) ?? [])[0]?.extension ?? ''))}>
                              <PhoneForwarded className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                        {(directory?.contacts ?? []).slice(0, 20).map((c: Record<string, unknown>) => (
                          <li key={String(c.id)} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50">
                            <div>
                              <p className="text-sm font-medium">{String(c.firstName)} {String(c.lastName ?? '')}</p>
                              <p className="text-xs text-muted-foreground">{String(c.extension ?? c.phone ?? c.email ?? '')}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!canManageContacts}
                              onClick={() => void contactMutations.update.mutateAsync({ id: String(c.id), payload: { favorite: !c.favorite } })}
                            >
                              <Star className={`h-4 w-4 ${c.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </QueryState>
                  </div>
                ) : null}

                {activePanel === 'favorites' ? (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {favorites.length === 0 ? (
                      <EmptyState title="No favorites" description="Star contacts in the directory to add favorites." icon={Star} />
                    ) : (
                      favorites.map((c: Record<string, unknown>) => (
                        <li key={String(c.id)} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50">
                          <span className="text-sm">{String(c.firstName)} {String(c.lastName ?? '')}</span>
                          <Button size="sm" variant="outline" onClick={() => setTransferTarget(String(c.extension ?? c.phone ?? ''))}>Dial</Button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>

              {/* Call control bar */}
              {canWrite ? (
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Call Control</p>
                  <div className="flex flex-wrap gap-2">
                    <Input placeholder="Transfer target (ext or number)" value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="max-w-xs" />
                    <Button size="sm" variant="outline" disabled={!selectedCall} onClick={() => selectedCall && runAction('hold', { platformUuid: selectedCall, hold: true })}>
                      <Pause className="mr-1 h-4 w-4" /> Hold
                    </Button>
                    <Button size="sm" variant="outline" disabled={!selectedCall} onClick={() => selectedCall && runAction('mute', { platformUuid: selectedCall, muted: true })}>
                      <MicOff className="mr-1 h-4 w-4" /> Mute
                    </Button>
                    <Button size="sm" variant="outline" disabled={!selectedCall || !transferTarget} onClick={() => selectedCall && runAction('transfer', { platformUuid: selectedCall, target: transferTarget, warm: false })}>
                      <ArrowRightLeft className="mr-1 h-4 w-4" /> Blind Transfer
                    </Button>
                    <Button size="sm" variant="outline" disabled={!selectedCall || !transferTarget} onClick={() => selectedCall && runAction('transfer', { platformUuid: selectedCall, target: transferTarget, warm: true })}>
                      <PhoneForwarded className="mr-1 h-4 w-4" /> Warm Transfer
                    </Button>
                    <Button size="sm" variant="outline" disabled={!selectedCall} onClick={() => selectedCall && runAction('park', { platformUuid: selectedCall })}>
                      Park
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!selectedCall} onClick={() => selectedCall && runAction('hangup', { platformUuid: selectedCall })}>
                      <PhoneOff className="mr-1 h-4 w-4" /> Hangup
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runAction('groupPickup', {})}>
                      Group Pickup
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Parking + speed dial */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold">Parking Lots</h3>
                  <QueryState isLoading={parkingQuery.isLoading} isError={parkingQuery.isError} error={parkingQuery.error} skeleton={<Skeleton className="h-24" />}>
                    {parked.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No parked calls</p>
                    ) : (
                      <ul className="space-y-2">
                        {parked.map((p) => (
                          <li key={String(p.slot)} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                            <span>Slot {String(p.slot)}</span>
                            {canWrite ? (
                              <Button size="sm" variant="outline" onClick={() => runAction('retrieve', { slot: String(p.slot) })}>Retrieve</Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </QueryState>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold">Speed Dial</h3>
                  {speedDial.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Assign speed dial numbers on contacts.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {speedDial.slice(0, 9).map((c: Record<string, unknown>) => (
                        <Button key={String(c.id)} size="sm" variant="outline" className="justify-start" onClick={() => setTransferTarget(String(c.extension ?? c.phone ?? ''))}>
                          <span className="font-mono text-xs">{String(c.speedDial)}</span>
                          <span className="ml-1 truncate text-xs">{String(c.firstName)}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Live updates refresh every 5–10 seconds. SSE stream available at <code className="rounded bg-muted px-1">/v1/tenant/reception/events/stream</code>.
          </p>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
