'use client';

import { useTenantRecordings } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type RecordingRow = Record<string, unknown> & { id: string };

const columns: Column<RecordingRow>[] = [
  { key: 'publicId', header: 'ID', cell: (r) => <span className="font-mono text-xs">{String(r.publicId ?? r.id)}</span> },
  { key: 'duration', header: 'Duration', cell: (r) => `${String(r.durationSeconds ?? 0)}s` },
  { key: 'created', header: 'Created', cell: (r) => r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : '—' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'available') === 'available' ? 'active' : 'pending'} /> },
];

export function RecordingsContent() {
  const query = useTenantRecordings();
  const rows = withRowIds(query.data ?? []) as RecordingRow[];

  return (
    <ModuleAccessGate moduleId="call-recordings">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No recordings"
          emptyDescription="Call recordings will appear here when recording policies are enabled."
        />
      )}
    </ModuleAccessGate>
  );
}
