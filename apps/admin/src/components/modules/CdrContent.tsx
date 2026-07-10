'use client';

import { useTenantCdr } from '../../lib/hooks/queries/use-tenant';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type CdrRow = Record<string, unknown> & { id: string };

const columns: Column<CdrRow>[] = [
  { key: 'time', header: 'Started', cell: (r) => <span className="text-muted-foreground">{r.startedAt ? new Date(String(r.startedAt)).toLocaleString() : '—'}</span> },
  { key: 'type', header: 'Type', cell: (r) => String(r.callType ?? '—') },
  { key: 'state', header: 'State', cell: (r) => <StatusBadge status={String(r.state ?? '').includes('ENDED') ? 'healthy' : 'online'} /> },
  { key: 'uuid', header: 'Platform UUID', cell: (r) => <span className="font-mono text-xs">{String(r.platformUuid ?? '—')}</span> },
  { key: 'ended', header: 'Ended', cell: (r) => r.endedAt ? new Date(String(r.endedAt)).toLocaleString() : '—' },
];

export function CdrContent() {
  const query = useTenantCdr({ limit: 200 });
  const rows = withRowIds(query.data ?? []) as CdrRow[];

  return (
    <ModuleAccessGate moduleId="cdr">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No call detail records"
          emptyDescription="CDR entries will appear here as calls are processed."
        />
      )}
    </ModuleAccessGate>
  );
}
