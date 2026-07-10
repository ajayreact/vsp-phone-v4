'use client';

import { useTenantVoicemail } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { CreateButton, ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type VoicemailRow = Record<string, unknown> & { id: string };

const columns: Column<VoicemailRow>[] = [
  { key: 'name', header: 'Mailbox', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? r.mailbox ?? '')}</span> },
  { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
  { key: 'email', header: 'Notification', cell: (r) => String(r.email ?? r.notifyEmail ?? '—') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'pending'} /> },
];

export function VoicemailContent() {
  const query = useTenantVoicemail();
  const rows = withRowIds(query.data ?? []) as VoicemailRow[];

  return (
    <ModuleAccessGate moduleId="voicemail">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No voicemail boxes"
          emptyDescription="Configure voicemail boxes for extensions and queues."
          primaryAction={<CreateButton label="Add Voicemail" />}
        />
      )}
    </ModuleAccessGate>
  );
}
