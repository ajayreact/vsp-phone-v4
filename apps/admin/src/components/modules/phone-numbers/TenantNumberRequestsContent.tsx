'use client';

import { motion } from 'framer-motion';
import {
  useCancelNumberRequest,
  useCreateNumberRequest,
  useTenantNumberRequestsList,
} from '../../../lib/hooks/queries/use-marketplace';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { QueryState } from '../../feedback/QueryState';
import { DataTable, type Column } from '../../data/DataTable';
import { EmptyState } from '../../data/EmptyState';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/Badge';
import { SlideOver } from '../../ui/SlideOver';
import { Input } from '../../ui/Input';
import { useState } from 'react';
import { History } from 'lucide-react';

type RequestRow = Record<string, unknown> & { id: string; phoneNumber: string; status: string };

export function TenantNumberRequestsContent() {
  const query = useTenantNumberRequestsList();
  const cancel = useCancelNumberRequest();
  const create = useCreateNumberRequest();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rows = (query.data ?? []).map((r) => ({ ...r, id: String(r.id) })) as RequestRow[];

  const columns: Column<RequestRow>[] = [
    { key: 'number', header: 'Number', cell: (r) => <span className="font-mono">{r.phoneNumber}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusBadge
          status={r.status === 'PENDING' ? 'pending' : r.status === 'REJECTED' ? 'offline' : 'active'}
        />
      ),
    },
    {
      key: 'date',
      header: 'Requested',
      cell: (r) => new Date(String(r.createdAt ?? '')).toLocaleString(),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) =>
        r.status === 'PENDING' ? (
          <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
            Cancel
          </Button>
        ) : null,
    },
  ];

  const submit = async () => {
    setError(null);
    try {
      await create.mutateAsync({ phoneNumber: number.trim(), notes: notes.trim() || undefined });
      setOpen(false);
      setNumber('');
      setNotes('');
      void query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <ModuleAccessGate moduleId="number-requests">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <PageHeader
              title={module.label}
              description="Request phone numbers from platform inventory. Tenants cannot browse Telnyx directly."
              actions={
                <Button size="sm" onClick={() => setOpen(true)}>
                  New request
                </Button>
              }
            />
            <QueryState
              isLoading={query.isLoading}
              isError={query.isError}
              error={query.error}
              onRetry={() => void query.refetch()}
              isEmpty={!rows.length}
              empty={
                <EmptyState
                  title="No number requests"
                  description="Submit a request when you need additional DIDs from the platform."
                  icon={History}
                  action={<Button onClick={() => setOpen(true)}>New request</Button>}
                />
              }
            >
              <DataTable columns={columns} data={rows} pageSize={20} />
            </QueryState>
          </motion.div>

          <SlideOver open={open} onClose={() => setOpen(false)} title="Request phone number">
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Phone number (E.164)</span>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+13135551234" />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Notes</span>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" disabled={!number.trim() || create.isPending} onClick={() => void submit()}>
                Submit request
              </Button>
            </div>
          </SlideOver>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
