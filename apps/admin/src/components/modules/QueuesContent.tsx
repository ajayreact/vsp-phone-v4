'use client';

import { useState } from 'react';
import { useCreateTenantQueue } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantQueues } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { NameCodeCreateSlideOver, WriteCreateButton } from './shared/TenantCreateForms';

type QueueRow = Record<string, unknown> & { id: string };

const columns: Column<QueueRow>[] = [
  { key: 'name', header: 'Queue', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
  { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
  { key: 'members', header: 'Members', cell: (r) => String((r.members as unknown[])?.length ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function QueuesContent() {
  const [open, setOpen] = useState(false);
  const query = useTenantQueues();
  const create = useCreateTenantQueue();
  const rows = withRowIds(query.data ?? []) as QueueRow[];

  return (
    <ModuleAccessGate moduleId="queues">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No call queues"
            emptyDescription="Create a queue to route inbound calls to agents."
            primaryAction={
              <WriteCreateButton
                writePermission={PERMISSIONS.TENANT_QUEUES_WRITE}
                label="Create Queue"
                onClick={() => setOpen(true)}
              />
            }
          />
          <NameCodeCreateSlideOver
            open={open}
            onClose={() => setOpen(false)}
            title="Create Queue"
            description="Add a call queue for agent routing."
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
