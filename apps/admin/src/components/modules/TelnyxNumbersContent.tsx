'use client';

import { motion } from 'framer-motion';
import {
  Download,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignNumberToTenant,
  fetchTelnyxNumbers,
  fetchTelnyxSummary,
} from '../../lib/api/telnyx-numbers';
import { mockTenants, type TelnyxNumber } from '../../lib/mock/telecom';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation/config';
import { DataTable, type Column } from '../data/DataTable';
import { FilterBar } from '../data/FilterBar';
import { MetricCard } from '../data/MetricCard';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Badge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';

type ModuleRow = Record<string, unknown> & { id: string };

const columns: Column<ModuleRow>[] = [
  {
    key: 'number',
    header: 'Number',
    sortable: true,
    cell: (r) => <span className="font-mono text-sm font-medium">{String(r.number ?? '')}</span>,
  },
  {
    key: 'type',
    header: 'Type',
    cell: (r) => <Badge variant="outline">{String(r.type ?? '')}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (
      <StatusBadge
        status={
          r.status === 'available'
            ? 'active'
            : r.status === 'assigned'
              ? 'online'
              : 'pending'
        }
      />
    ),
  },
  {
    key: 'capabilities',
    header: 'Capabilities',
    cell: (r) => (
      <span className="text-muted-foreground">
        {Array.isArray(r.capabilities) ? (r.capabilities as string[]).join(', ') : ''}
      </span>
    ),
  },
  {
    key: 'assignedTenant',
    header: 'Tenant',
    cell: (r) => (
      <span className={r.assignedTenant ? 'font-medium' : 'text-muted-foreground'}>
        {String(r.assignedTenant ?? 'Unassigned')}
      </span>
    ),
  },
  {
    key: 'monthlyCost',
    header: 'Cost/mo',
    cell: (r) => <span className="tabular-nums">${Number(r.monthlyCost ?? 0).toFixed(2)}</span>,
  },
  {
    key: 'region',
    header: 'Region',
    cell: (r) => <span className="text-muted-foreground">{String(r.region ?? '')}</span>,
  },
];

export function TelnyxNumbersContent() {
  const module = getModuleById('telnyx-numbers')!;
  const permissions = usePermissions();
  const [numbers, setNumbers] = useState<TelnyxNumber[]>([]);
  const [summary, setSummary] = useState({ total: 0, available: 0, assigned: 0, pending: 0, monthlySpend: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<TelnyxNumber | null>(null);
  const [assignTenant, setAssignTenant] = useState('');
  const [assignTarget, setAssignTarget] = useState('');
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, sum] = await Promise.all([fetchTelnyxNumbers(), fetchTelnyxSummary()]);
    setNumbers(rows);
    setSummary(sum);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = numbers as unknown as ModuleRow[];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    if (filter !== 'all') {
      list = list.filter((r) => r.status === filter);
    }
    return list;
  }, [numbers, search, filter]);

  const handleAssign = async () => {
    if (!selected || !assignTenant) return;
    setAssigning(true);
    await assignNumberToTenant(selected.id, assignTenant, assignTarget || 'Unassigned');
    setAssigning(false);
    setSelected(null);
    load();
  };

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
          description="Platform-wide phone number inventory. Purchase and manage numbers here before assigning to tenants."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Sync Telnyx
              </Button>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Purchase Number
              </Button>
            </div>
          }
        />

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Inventory" value={summary.total} />
          <MetricCard label="Available" value={summary.available} change="Ready to assign" changeType="up" />
          <MetricCard label="Assigned" value={summary.assigned} />
          <MetricCard label="Monthly Spend" value={`$${summary.monthlySpend.toFixed(2)}`} hint={`${summary.pending} pending`} />
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-lg flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search numbers, tenants, regions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterBar
            filters={[
              { id: 'all', label: 'All' },
              { id: 'available', label: 'Available' },
              { id: 'assigned', label: 'Assigned' },
              { id: 'pending', label: 'Pending' },
              { id: 'porting', label: 'Porting' },
            ]}
            active={filter}
            onChange={setFilter}
          />
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          emptyTitle="No Telnyx numbers in inventory"
          emptyDescription="Purchase numbers from Telnyx to build your platform inventory."
          emptyAction={
            <Button>
              <Plus className="h-4 w-4" />
              Purchase Number
            </Button>
          }
          rowActions={(row) => [
            {
              id: 'view',
              label: 'View & assign',
              onSelect: () => {
                const n = numbers.find((x) => x.id === row.id);
                if (n) {
                  setSelected(n);
                  setAssignTenant(n.assignedTenant ?? '');
                  setAssignTarget(n.assignedTo ?? '');
                }
              },
            },
            { id: 'release', label: 'Release number', destructive: true },
          ]}
        />
      </motion.div>

      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.number ?? 'Number details'}
        description={selected?.e164}
        footer={
          selected?.status === 'available' || selected?.status === 'assigned' ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={assigning || !assignTenant}>
                {assigning ? 'Assigning…' : 'Assign to tenant'}
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Type', selected.type],
                ['Status', selected.status],
                ['Region', selected.region],
                ['Trunk', selected.trunkGroup],
                ['Connection ID', selected.telnyxConnectionId],
                ['Purchased', selected.purchasedAt],
                ['Monthly cost', `$${selected.monthlyCost.toFixed(2)}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium capitalize">{v}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Capabilities
              </p>
              <div className="flex flex-wrap gap-2">
                {selected.capabilities.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-sm font-semibold">Assign to tenant</p>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Tenant</label>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  value={assignTenant}
                  onChange={(e) => setAssignTenant(e.target.value)}
                >
                  <option value="">Select tenant…</option>
                  {mockTenants.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Assigned to (IVR, queue, ext.)</label>
                <Input
                  placeholder="e.g. Main IVR, Sales Queue, ext. 2001"
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : null}
      </SlideOver>
    </PageContainer>
  );
}
