'use client';

import { useState } from 'react';
import { useCreateTenantIvr } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantIvrs } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { NameCodeCreateSlideOver, WriteCreateButton } from './shared/TenantCreateForms';

type IvrRow = Record<string, unknown> & { id: string };

const columns: Column<IvrRow>[] = [
  { key: 'name', header: 'IVR', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{String(r.code ?? '')}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function IvrContent() {
  const [open, setOpen] = useState(false);
  const query = useTenantIvrs();
  const create = useCreateTenantIvr();
  const rows = withRowIds(query.data ?? []) as IvrRow[];

  return (
    <ModuleAccessGate moduleId="ivr">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No IVR menus"
            emptyDescription="Create an IVR to build interactive call flows."
            primaryAction={
              <WriteCreateButton
                writePermission={PERMISSIONS.TENANT_IVR_WRITE}
                label="Create IVR"
                onClick={() => setOpen(true)}
              />
            }
          />
          <NameCodeCreateSlideOver
            open={open}
            onClose={() => setOpen(false)}
            title="Create IVR"
            description="Add an interactive voice response menu."
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
