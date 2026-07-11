'use client';

import { usePortal } from '../../lib/portal/PortalProvider';
import { usePlatformAudit } from '../../lib/hooks/queries/use-platform';
import { useOpsAudit } from '../../lib/hooks/queries/use-ops';
import type { AuditLogRecord } from '../../types/portal';
import type { Column } from '../data/DataTable';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';

type AuditRow = AuditLogRecord & { id: string };

const columns: Column<AuditRow>[] = [
  { key: 'action', header: 'Action', sortable: true, cell: (r) => <span className="font-medium">{r.action}</span> },
  { key: 'actor', header: 'Actor', cell: (r) => r.actor ?? r.userId ?? '—' },
  { key: 'time', header: 'Time', cell: (r) => <span className="text-muted-foreground">{new Date(r.ts).toLocaleString()}</span> },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantId ?? '—' },
  { key: 'ip', header: 'IP', cell: (r) => <span className="font-mono text-xs">{r.ip ?? r.ipAddress ?? '—'}</span> },
];

export function AuditLogsContent() {
  const portal = usePortal();
  const platformQuery = usePlatformAudit({ limit: 100 });
  const opsQuery = useOpsAudit({ limit: 100 });
  const query = portal === 'platform' ? platformQuery : opsQuery;
  const rows = withRowIds(query.data ?? []) as AuditRow[];

  return (
    <ModuleAccessGate moduleId="audit-logs">
      {({ module }) => (
        <ModuleListShell
          module={module}
          query={{ ...query, data: rows }}
          columns={columns}
          emptyTitle="No audit events"
          emptyDescription="Security and configuration changes will be recorded here."
        />
      )}
    </ModuleAccessGate>
  );
}
