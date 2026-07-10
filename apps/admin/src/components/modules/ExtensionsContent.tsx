'use client';

import { motion } from 'framer-motion';
import { Plus, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useExtensions } from '../../lib/hooks/queries/use-telecom';
import { getModuleById } from '../../lib/navigation';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import type { ExtensionRecord } from '../../types/telecom';
import { DataTable, type Column } from '../data/DataTable';
import { SearchBar } from '../data/SearchBar';
import { EmptyState } from '../data/EmptyState';
import { PermissionDenied } from '../data/PermissionDenied';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

const columns: Column<ExtensionRecord>[] = [
  { key: 'extension', header: 'Extension', sortable: true, cell: (r) => <span className="font-mono font-medium">{r.extension}</span> },
  { key: 'user', header: 'Display Name', cell: (r) => r.userDisplayName ?? '—' },
  { key: 'tenant', header: 'Tenant', cell: (r) => r.tenantName ?? '—' },
  { key: 'callerId', header: 'Caller ID', cell: (r) => r.callerId ?? '—' },
  { key: 'device', header: 'Device', cell: (r) => r.deviceLabel ?? '—' },
  { key: 'registration', header: 'Registration', cell: (r) => <StatusBadge status={r.registration === 'online' ? 'online' : 'offline'} /> },
  { key: 'presence', header: 'Presence', cell: (r) => r.presence },
  { key: 'vm', header: 'Voicemail', cell: (r) => (r.voicemailEnabled ? 'On' : 'Off') },
  { key: 'cf', header: 'Call Forward', cell: (r) => r.callForward ?? '—' },
  { key: 'dnd', header: 'DND', cell: (r) => (r.dnd ? 'On' : 'Off') },
  { key: 'lastReg', header: 'Last Registration', cell: (r) => r.lastRegistrationAt ?? '—' },
  { key: 'codec', header: 'Codec', cell: (r) => r.codec ?? '—' },
];

export function ExtensionsContent() {
  const module = getModuleById('extensions')!;
  const permissions = usePermissions();
  const [search, setSearch] = useState('');
  const query = useExtensions(search);

  const rows = useMemo(() => query.data ?? [], [query.data]);

  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="Extensions"
          description="Extension lines, registrations, presence, and device assignments."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" disabled>
                <Plus className="h-4 w-4" />
                Add Extension
              </Button>
            </div>
          }
        />
        <div className="mb-6 max-w-lg">
          <SearchBar value={search} onChange={setSearch} placeholder="Search extensions, users, devices…" />
        </div>
        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!rows.length}
          empty={
            <EmptyState
              title="No extensions"
              description="Extension data loads from GET /v1/extensions when the API is available."
              action={<Button disabled><Plus className="h-4 w-4" />Add Extension</Button>}
            />
          }
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <DataTable columns={columns} data={rows} />
        </QueryState>
      </motion.div>
    </PageContainer>
  );
}
