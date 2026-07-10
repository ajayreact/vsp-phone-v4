'use client';

import { useState } from 'react';
import { useCreateTenantRoutingPolicy } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantDevices, useTenantRouting } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { LineSelectCreateSlideOver, useLineOptionsFromDevices, WriteCreateButton } from './shared/TenantCreateForms';

type RoutingRow = Record<string, unknown> & { id: string };

const columns: Column<RoutingRow>[] = [
  {
    key: 'line',
    header: 'Line',
    sortable: true,
    cell: (r) => {
      const line = r.line as { name?: string } | undefined;
      return <span className="font-medium">{line?.name ?? '—'}</span>;
    },
  },
  {
    key: 'inbound',
    header: 'Inbound',
    cell: (r) => <StatusBadge status={r.inboundEnabled === true ? 'active' : 'offline'} />,
  },
  {
    key: 'outbound',
    header: 'Outbound',
    cell: (r) => <StatusBadge status={r.outboundEnabled === true ? 'active' : 'offline'} />,
  },
];

export function CallRoutingContent() {
  const [open, setOpen] = useState(false);
  const query = useTenantRouting();
  const devicesQuery = useTenantDevices();
  const create = useCreateTenantRoutingPolicy();
  const lineOptions = useLineOptionsFromDevices(devicesQuery.data ?? []);
  const rows = withRowIds(query.data ?? []) as RoutingRow[];

  return (
    <ModuleAccessGate moduleId="call-routing">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No routing policies"
            emptyDescription="Define inbound and outbound routing rules for your tenant."
            primaryAction={
              <WriteCreateButton
                writePermission={PERMISSIONS.TENANT_ROUTING_WRITE}
                label="Add Policy"
                onClick={() => setOpen(true)}
              />
            }
          />
          <LineSelectCreateSlideOver
            open={open}
            onClose={() => setOpen(false)}
            title="Add Routing Policy"
            description="Configure inbound and outbound call permissions for a line."
            isPending={create.isPending}
            lineOptions={lineOptions}
            onSubmit={async ({ lineId }) => {
              await create.mutateAsync({ lineId, inboundEnabled: true, outboundEnabled: true });
            }}
          />
        </>
      )}
    </ModuleAccessGate>
  );
}
