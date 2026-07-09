'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mockLiveCalls } from '../../lib/mock/telecom';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation/config';
import { DataTable, type Column } from '../data/DataTable';
import { LiveIndicator } from '../ui/LiveIndicator';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';

type Row = Record<string, unknown> & { id: string };

const columns: Column<Row>[] = [
  { key: 'direction', header: 'Direction', cell: (r) => String(r.direction ?? '') },
  { key: 'from', header: 'From', cell: (r) => <span className="font-mono text-xs">{String(r.from ?? '')}</span> },
  { key: 'to', header: 'To', cell: (r) => String(r.to ?? '') },
  { key: 'tenant', header: 'Tenant', cell: (r) => String(r.tenant ?? '') },
  { key: 'duration', header: 'Duration', cell: (r) => <span className="font-mono text-xs">{String(r.duration ?? '')}</span> },
  { key: 'state', header: 'State', cell: (r) => <StatusBadge status={r.state === 'Active' ? 'online' : 'warning'} /> },
  { key: 'quality', header: 'MOS', cell: (r) => String(r.quality ?? '—') },
];

export function LiveCallsContent() {
  const module = getModuleById('live-calls')!;
  const permissions = usePermissions();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  const rows = mockLiveCalls as unknown as Row[];

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="Live Calls"
          description="Active call sessions across the platform. Connects to observability diagnostics when available."
          actions={
            <div className="flex items-center gap-2">
              <LiveIndicator label="Polling 30s" status="online" />
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          }
        />
        <DataTable columns={columns} data={rows} loading={loading} pageSize={20} />
      </motion.div>
    </PageContainer>
  );
}
