'use client';

import { useState } from 'react';
import { useCreateTenantRingGroup } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantRingGroups } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Input } from '../ui/Input';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { SlideOver } from '../ui/SlideOver';
import { Button } from '../ui/Button';
import { WriteCreateButton } from './shared/TenantCreateForms';

type RingGroupRow = Record<string, unknown> & { id: string };

const columns: Column<RingGroupRow>[] = [
  { key: 'name', header: 'Ring Group', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
  { key: 'members', header: 'Members', cell: (r) => String((r.members as unknown[])?.length ?? 0) },
  { key: 'timeout', header: 'Timeout', cell: (r) => (r.timeoutSec != null ? `${r.timeoutSec}s` : '—') },
];

function RingGroupCreateSlideOver({
  open,
  onClose,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (values: { name: string; strategy?: string; timeoutSec?: number }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('RING_ALL');
  const [timeoutSec, setTimeoutSec] = useState('30');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setStrategy('RING_ALL');
    setTimeoutSec('30');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        strategy,
        timeoutSec: Number(timeoutSec) || 30,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      title="Create Ring Group"
      description="Ring multiple extensions simultaneously or in sequence."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isPending || !name.trim()}>
            {isPending ? 'Saving…' : 'Create'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Name *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Strategy</span>
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            <option value="RING_ALL">Ring all</option>
            <option value="HUNT">Hunt</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Timeout (seconds)</span>
          <Input value={timeoutSec} onChange={(e) => setTimeoutSec(e.target.value)} type="number" min={5} />
        </label>
      </div>
    </SlideOver>
  );
}

export function RingGroupsContent() {
  const [open, setOpen] = useState(false);
  const query = useTenantRingGroups();
  const create = useCreateTenantRingGroup();
  const rows = withRowIds(query.data ?? []) as RingGroupRow[];

  return (
    <ModuleAccessGate moduleId="ring-groups">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No ring groups"
            emptyDescription="Create a ring group to ring multiple extensions simultaneously."
            primaryAction={
              <WriteCreateButton
                writePermission={PERMISSIONS.TENANT_ROUTING_WRITE}
                label="Create Ring Group"
                onClick={() => setOpen(true)}
              />
            }
          />
          <RingGroupCreateSlideOver
            open={open}
            onClose={() => setOpen(false)}
            isPending={create.isPending}
            onSubmit={async (values) => {
              await create.mutateAsync(values);
            }}
          />
        </>
      )}
    </ModuleAccessGate>
  );
}
