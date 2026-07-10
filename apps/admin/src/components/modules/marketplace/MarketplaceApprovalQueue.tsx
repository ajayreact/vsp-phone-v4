'use client';

import { Check, History, X } from 'lucide-react';
import { useState } from 'react';
import {
  useBulkApprovePlatformRequests,
  useBulkRejectPlatformRequests,
  usePlatformMarketplaceReports,
  usePlatformNumberRequests,
} from '../../../lib/hooks/queries/use-marketplace';
import { useApproveTelnyxRequest, useRejectTelnyxRequest } from '../../../lib/hooks/queries/use-telecom';
import type { PlatformNumberRequest } from '../../../types/marketplace';
import { DataTable, type Column } from '../../data/DataTable';
import { EmptyState } from '../../data/EmptyState';
import { FilterBar } from '../../data/FilterBar';
import { QueryState } from '../../feedback/QueryState';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card, CardBody } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { SlideOver } from '../../ui/SlideOver';
import { Skeleton } from '../../ui/Skeleton';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'EXPIRED', label: 'Expired' },
  { id: 'PURCHASED', label: 'Purchased' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

function ReservationCountdown({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="text-muted-foreground">—</span>;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return <span className="text-destructive text-xs">Expired</span>;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return <span className="text-xs text-amber-600">{hours}h {mins}m</span>;
}

export function MarketplaceApprovalQueue() {
  const [status, setStatus] = useState('PENDING');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<PlatformNumberRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [approveAction, setApproveAction] = useState<'assign' | 'purchase_then_assign'>('assign');

  const query = usePlatformNumberRequests(status === 'all' ? undefined : status);
  const reports = usePlatformMarketplaceReports();
  const approve = useApproveTelnyxRequest();
  const reject = useRejectTelnyxRequest();
  const bulkApprove = useBulkApprovePlatformRequests();
  const bulkReject = useBulkRejectPlatformRequests();

  const columns: Column<PlatformNumberRequest>[] = [
    { key: 'number', header: 'Number', cell: (r) => <span className="font-mono font-medium">{r.phoneNumber}</span> },
    { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName },
    { key: 'requester', header: 'Requested By', cell: (r) => r.requesterEmail ?? r.requestedBy.slice(0, 8) },
    { key: 'priority', header: 'Priority', cell: (r) => <Badge variant="outline">{r.priority}</Badge> },
    { key: 'expiry', header: 'Reservation', cell: (r) => <ReservationCountdown expiresAt={r.reservationExpiresAt} /> },
    { key: 'date', header: 'Requested', cell: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'status', header: 'Status', cell: (r) => r.status },
  ];

  return (
    <div className="space-y-6">
      {reports.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: 'Pending', value: reports.data.requests.pending },
            { label: 'Assigned', value: reports.data.requests.assigned },
            { label: 'Rejected', value: reports.data.requests.rejected },
            { label: 'Reserved', value: reports.data.reservedInventory },
            { label: 'Avg Approval (h)', value: reports.data.avgApprovalHours },
          ].map((c) => (
            <Card key={c.label} className="glass-card">
              <CardBody className="py-2">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-semibold tabular-nums">{c.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}

      <FilterBar filters={STATUS_FILTERS} active={status} onChange={setStatus} />

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <span>{selectedIds.length} selected</span>
          <Button size="sm" variant="outline" disabled={bulkApprove.isPending} onClick={() => bulkApprove.mutate({ ids: selectedIds, action: approveAction }, { onSuccess: () => setSelectedIds([]) })}>
            Bulk Approve
          </Button>
          <Button size="sm" variant="outline" disabled={bulkReject.isPending} onClick={() => bulkReject.mutate({ ids: selectedIds, notes: rejectNotes }, { onSuccess: () => setSelectedIds([]) })}>
            Bulk Reject
          </Button>
        </div>
      ) : null}

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!query.data?.length}
        empty={<EmptyState title="No requests" description="Tenant number requests will appear here for review." />}
        skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
      >
        <DataTable
          columns={columns}
          data={query.data ?? []}
          pageSize={20}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          rowActions={(row) => [{ id: 'review', label: 'Review', onSelect: () => setDetail(row) }]}
        />
      </QueryState>

      {detail ? (
        <SlideOver
          open
          onClose={() => setDetail(null)}
          title={detail.phoneNumber}
          description={`${detail.tenantName} · ${detail.status}`}
          width="lg"
          footer={
            detail.status === 'PENDING' ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => reject.mutate({ id: detail.id, notes: rejectNotes, internalNotes }, { onSuccess: () => setDetail(null) })} disabled={reject.isPending}>
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button onClick={() => approve.mutate({ id: detail.id, notes: rejectNotes, internalNotes, action: approveAction }, { onSuccess: () => setDetail(null) })} disabled={approve.isPending}>
                  <Check className="h-4 w-4" /> Approve
                </Button>
              </div>
            ) : null
          }
        >
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Company</dt><dd>{detail.companyName}</dd></div>
            <div><dt className="text-muted-foreground">Requested By</dt><dd>{detail.requesterEmail ?? detail.requestedBy}</dd></div>
            <div><dt className="text-muted-foreground">Priority</dt><dd>{detail.priority}</dd></div>
            <div><dt className="text-muted-foreground">Reservation Expiry</dt><dd><ReservationCountdown expiresAt={detail.reservationExpiresAt} /></dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">Business Reason</dt><dd>{detail.businessReason ?? '—'}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">Requested Features</dt><dd>{detail.requestedFeatures.join(', ') || 'Voice'}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">Tenant Notes</dt><dd>{detail.notes ?? '—'}</dd></div>
          </dl>
          {detail.status === 'PENDING' ? (
            <div className="space-y-3 border-t border-border pt-4">
              <label className="block space-y-1 text-sm"><span className="font-medium">Approval action</span>
                <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={approveAction} onChange={(e) => setApproveAction(e.target.value as 'assign' | 'purchase_then_assign')}>
                  <option value="assign">Assign immediately (inventory)</option>
                  <option value="purchase_then_assign">Purchase then assign</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm"><span className="font-medium">Response notes (tenant-visible)</span><Input value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} /></label>
              <label className="block space-y-1 text-sm"><span className="font-medium">Internal notes</span><Input value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} /></label>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><History className="h-4 w-4" />Review complete — status: {detail.status}</p>
          )}
        </SlideOver>
      ) : null}
    </div>
  );
}
