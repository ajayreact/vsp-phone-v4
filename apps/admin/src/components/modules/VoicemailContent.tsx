'use client';

import { useState } from 'react';
import { useCreateTenantVoicemail } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantDevices, useTenantVoicemail } from '../../lib/hooks/queries/use-tenant';
import { PERMISSIONS } from '../../lib/rbac/permissions';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { LineSelectCreateSlideOver, useLineOptionsFromDevices, WriteCreateButton } from './shared/TenantCreateForms';

type VoicemailRow = Record<string, unknown> & { id: string };

const columns: Column<VoicemailRow>[] = [
  {
    key: 'line',
    header: 'Line',
    sortable: true,
    cell: (r) => {
      const line = r.line as { name?: string } | undefined;
      return <span className="font-medium">{line?.name ?? '—'}</span>;
    },
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
  { key: 'pin', header: 'PIN', cell: (r) => (r.pin ? 'Set' : '—') },
];

export function VoicemailContent() {
  const [open, setOpen] = useState(false);
  const query = useTenantVoicemail();
  const devicesQuery = useTenantDevices();
  const create = useCreateTenantVoicemail();
  const lineOptions = useLineOptionsFromDevices(devicesQuery.data ?? []);
  const rows = withRowIds(query.data ?? []) as VoicemailRow[];

  return (
    <ModuleAccessGate moduleId="voicemail">
      {({ module }) => (
        <>
          <ModuleListShell
            module={module}
            query={{ ...query, data: rows }}
            columns={columns}
            emptyTitle="No voicemail boxes"
            emptyDescription="Configure voicemail boxes for extensions and queues."
            primaryAction={
              <WriteCreateButton
                writePermission={PERMISSIONS.TENANT_VOICEMAIL_WRITE}
                label="Add Voicemail"
                onClick={() => setOpen(true)}
              />
            }
          />
          <LineSelectCreateSlideOver
            open={open}
            onClose={() => setOpen(false)}
            title="Add Voicemail"
            description="Assign a voicemail box to a line."
            isPending={create.isPending}
            lineOptions={lineOptions}
            onSubmit={async ({ lineId }) => {
              await create.mutateAsync({ lineId });
            }}
          />
        </>
      )}
    </ModuleAccessGate>
  );
}
