'use client';

import { motion } from 'framer-motion';
import { Download, Plus, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth, usePermissions } from '../../lib/auth/AuthProvider';
import {
  useAssignTelnyxNumber,
  useBulkAssignTelnyxNumbers,
  usePurchaseTelnyxNumber,
  useReleaseTelnyxNumber,
  useTelnyxNumbers,
} from '../../lib/hooks/queries/use-telecom';
import { getModuleById } from '../../lib/navigation/config';
import type { TelnyxNumberRecord } from '../../types/telecom';
import { DataTable, type Column } from '../data/DataTable';
import { FilterBar } from '../data/FilterBar';
import { EmptyState } from '../data/EmptyState';
import { PermissionDenied } from '../data/PermissionDenied';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Badge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { Skeleton } from '../ui/Skeleton';

const columns: Column<TelnyxNumberRecord>[] = [
  { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono text-sm font-medium">{r.number}</span> },
  { key: 'connectionType', header: 'Connection', cell: (r) => r.connectionType ?? '—' },
  { key: 'voiceProfile', header: 'Voice Profile', cell: (r) => r.voiceProfile ?? '—' },
  { key: 'sms', header: 'SMS', cell: (r) => (r.smsEnabled ? 'Yes' : 'No') },
  { key: 'mms', header: 'MMS', cell: (r) => (r.mmsEnabled ? 'Yes' : 'No') },
  { key: 'emergency', header: 'E911', cell: (r) => (r.emergencyEnabled ? 'Yes' : 'No') },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.assignedTenantName ?? <span className="text-muted-foreground">Unassigned</span> },
  { key: 'extension', header: 'Extension', cell: (r) => r.assignedExtension ?? '—' },
  { key: 'ivr', header: 'IVR', cell: (r) => r.assignedIvr ?? '—' },
  { key: 'queue', header: 'Queue', cell: (r) => r.assignedQueue ?? '—' },
  { key: 'region', header: 'Region', cell: (r) => r.region },
  { key: 'cost', header: 'Cost/mo', cell: (r) => <span className="tabular-nums">${r.monthlyCost.toFixed(2)}</span> },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (
      <StatusBadge
        status={
          r.status === 'available'
            ? 'active'
            : r.status === 'active' || r.assignedTenantId
              ? 'online'
              : r.status === 'suspended'
                ? 'warning'
                : 'pending'
        }
      />
    ),
  },
];

function exportCsv(rows: TelnyxNumberRecord[]) {
  const header = ['number', 'region', 'status', 'tenant', 'extension', 'sms', 'mms', 'e911', 'monthlyCost'];
  const lines = rows.map((r) =>
    [
      r.number,
      r.region,
      r.status,
      r.assignedTenantName ?? '',
      r.assignedExtension ?? '',
      r.smsEnabled,
      r.mmsEnabled,
      r.emergencyEnabled,
      r.monthlyCost,
    ].join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `telnyx-numbers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TelnyxNumbersContent() {
  const module = getModuleById('telnyx-numbers')!;
  const permissions = usePermissions();
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [region, setRegion] = useState('');
  const [selected, setSelected] = useState<TelnyxNumberRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [extension, setExtension] = useState('');
  const [ivr, setIvr] = useState('');
  const [queue, setQueue] = useState('');
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [purchaseRegion, setPurchaseRegion] = useState('US');

  const query = useTelnyxNumbers({ search, status: filter, region });
  const assignMutation = useAssignTelnyxNumber();
  const purchaseMutation = usePurchaseTelnyxNumber();
  const releaseMutation = useReleaseTelnyxNumber();
  const bulkAssignMutation = useBulkAssignTelnyxNumbers();

  const rows = useMemo(() => query.data ?? [], [query.data]);

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
          title="Telnyx Numbers"
          description="Platform carrier inventory synced from Telnyx and PostgreSQL."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!rows.length}
                onClick={() => exportCsv(selectedIds.length ? rows.filter((r) => selectedIds.includes(r.id)) : rows)}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button size="sm" onClick={() => setPurchaseOpen(true)}>
                <Plus className="h-4 w-4" />
                Purchase Number
              </Button>
            </div>
          }
        />

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative max-w-lg flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search numbers, tenants…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Input className="max-w-[140px]" placeholder="Region" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <FilterBar
            filters={[
              { id: 'all', label: 'All' },
              { id: 'available', label: 'Available' },
              { id: 'active', label: 'Active' },
              { id: 'pending', label: 'Pending' },
              { id: 'porting', label: 'Porting' },
            ]}
            active={filter}
            onChange={setFilter}
          />
        </div>

        {selectedIds.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            <span>{selectedIds.length} selected</span>
            <Input className="h-8 max-w-[220px]" placeholder="Tenant ID for bulk assign" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={!tenantId || bulkAssignMutation.isPending}
              onClick={() => {
                bulkAssignMutation.mutate({ ids: selectedIds, tenantId, extension: extension || undefined }, {
                  onSuccess: () => setSelectedIds([]),
                });
              }}
            >
              Bulk assign
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                for (const id of selectedIds) releaseMutation.mutate(id);
                setSelectedIds([]);
              }}
            >
              Bulk release
            </Button>
          </div>
        ) : null}

        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!rows.length}
          empty={
            <EmptyState
              title="No Telnyx numbers in inventory"
              description="Purchase a number or sync from Telnyx when TELNYX_API_KEY is configured."
              action={
                <Button onClick={() => setPurchaseOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Purchase Number
                </Button>
              }
            />
          }
          skeleton={
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          }
        >
          <DataTable
            columns={columns}
            data={rows}
            pageSize={15}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            rowActions={(row) => [
              {
                id: 'view',
                label: 'View & assign',
                onSelect: () => {
                  setSelected(row);
                  setTenantId(row.assignedTenantId ?? session?.tenantId ?? '');
                  setExtension(row.assignedExtension ?? '');
                  setIvr(row.assignedIvr ?? '');
                  setQueue(row.assignedQueue ?? '');
                },
              },
              {
                id: 'release',
                label: 'Release',
                destructive: true,
                onSelect: () => releaseMutation.mutate(row.id),
              },
            ]}
          />
        </QueryState>
      </motion.div>

      <SlideOver
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        title="Purchase Telnyx number"
        description="Order via Telnyx API or register manually when API key is not set."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPurchaseOpen(false)}>Cancel</Button>
            <Button
              disabled={purchaseMutation.isPending}
              onClick={() => {
                purchaseMutation.mutate(
                  { phoneNumber: purchaseNumber || undefined, region: purchaseRegion, countryCode: 'US' },
                  { onSuccess: () => setPurchaseOpen(false) },
                );
              }}
            >
              {purchaseMutation.isPending ? 'Purchasing…' : 'Purchase'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">E.164 number (optional)</label>
            <Input value={purchaseNumber} onChange={(e) => setPurchaseNumber(e.target.value)} placeholder="+15551234567" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Region</label>
            <Input value={purchaseRegion} onChange={(e) => setPurchaseRegion(e.target.value)} placeholder="US / CA / NY" />
          </div>
          {purchaseMutation.isError ? (
            <p className="text-sm text-destructive">{purchaseMutation.error.message}</p>
          ) : null}
        </div>
      </SlideOver>

      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.number ?? 'Number details'}
        description={selected?.e164}
        footer={
          selected ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button
                disabled={!tenantId || assignMutation.isPending}
                onClick={() => {
                  assignMutation.mutate(
                    { id: selected.id, payload: { tenantId, extension: extension || undefined, ivr: ivr || undefined, queue: queue || undefined } },
                    { onSuccess: () => setSelected(null) },
                  );
                }}
              >
                {assignMutation.isPending ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Connection', selected.connectionType ?? '—'],
                ['Voice profile', selected.voiceProfile ?? '—'],
                ['Region', selected.region],
                ['Purchased', new Date(selected.purchasedAt).toLocaleString()],
                ['Monthly cost', `$${selected.monthlyCost.toFixed(2)}`],
                ['Status', selected.status],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {selected.smsEnabled ? <Badge variant="outline">SMS</Badge> : null}
              {selected.mmsEnabled ? <Badge variant="outline">MMS</Badge> : null}
              {selected.emergencyEnabled ? <Badge variant="outline">E911</Badge> : null}
            </div>
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-sm font-semibold">Assignment</p>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Tenant ID</label>
                <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="UUID" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Extension</label>
                <Input value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="101" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">IVR</label>
                <Input value={ivr} onChange={(e) => setIvr(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Queue</label>
                <Input value={queue} onChange={(e) => setQueue(e.target.value)} />
              </div>
              {assignMutation.isError ? (
                <p className="text-sm text-destructive">{assignMutation.error.message}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </SlideOver>
    </PageContainer>
  );
}
