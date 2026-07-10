'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTelnyxMarketplace } from '../../lib/hooks/queries/use-telecom';
import { tenantRepository } from '../../lib/repositories/tenant.repository';
import { Badge, StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { SlideOver } from '../ui/SlideOver';
import {
  ModuleAccessGate,
  ModuleListShell,
  withRowIds,
} from './shared/ModuleShell';
import type { TelnyxNumberRecord } from '../../types/telecom';

type MarketplaceRow = TelnyxNumberRecord & { id: string };

const columns: Column<MarketplaceRow>[] = [
  { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono font-medium">{r.number}</span> },
  { key: 'region', header: 'Region', cell: (r) => r.region },
  { key: 'features', header: 'Capabilities', cell: (r) => (
    <span className="flex gap-1">
      {r.smsEnabled ? <Badge variant="outline">SMS</Badge> : null}
      {r.emergencyEnabled ? <Badge variant="outline">E911</Badge> : null}
      <Badge variant="outline">Voice</Badge>
    </span>
  ) },
  { key: 'cost', header: 'Est. Cost/mo', cell: (r) => `$${r.monthlyCost.toFixed(2)}` },
  { key: 'status', header: 'Status', cell: () => <StatusBadge status="active" /> },
];

export function DidsContent() {
  const [search, setSearch] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [selected, setSelected] = useState<TelnyxNumberRecord | null>(null);
  const [notes, setNotes] = useState('');
  const query = useTelnyxMarketplace(search);
  const qc = useQueryClient();
  const requestMutation = useMutation({
    mutationFn: (payload: { phoneNumber: string; notes?: string }) =>
      tenantRepository.createNumberRequest(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant', 'number-requests'] });
      setRequestOpen(false);
      setSelected(null);
      setNotes('');
    },
  });
  const rows = withRowIds(query.data ?? []) as MarketplaceRow[];

  return (
    <ModuleAccessGate moduleId="dids">
      {({ module }) => (
        <>
          <ModuleListShell
            module={{ ...module, label: 'Number Marketplace', description: 'Browse platform inventory and request numbers. Telnyx is not accessed directly from the tenant portal.' }}
            query={{ ...query, data: rows }}
            columns={[
              ...columns,
              {
                key: 'action',
                header: '',
                cell: (r) => (
                  <Button size="sm" variant="outline" onClick={() => { setSelected(r); setRequestOpen(true); }}>
                    Request
                  </Button>
                ),
              },
            ]}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search available platform numbers…"
            emptyTitle="No numbers available"
            emptyDescription="Platform inventory is empty. Contact your administrator."
          />

          <SlideOver
            open={requestOpen && !!selected}
            onClose={() => { setRequestOpen(false); setSelected(null); }}
            title="Request Number"
            description={selected?.number}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
                <Button disabled={requestMutation.isPending} onClick={() => selected && requestMutation.mutate({ phoneNumber: selected.number, notes: notes || undefined })}>
                  {requestMutation.isPending ? 'Submitting…' : 'Submit Request'}
                </Button>
              </div>
            }
          >
            <p className="mb-4 text-sm text-muted-foreground">
              Your request will be reviewed by a platform administrator. Upon approval, the number will be reserved and assigned to your organization.
            </p>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Notes (optional)</span>
              <textarea className="min-h-[100px] w-full rounded-xl border border-border bg-background p-3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Intended use, department, etc." />
            </label>
            {requestMutation.isError ? <p className="mt-2 text-sm text-destructive">{requestMutation.error.message}</p> : null}
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}
