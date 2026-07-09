'use client';

import {
  Download,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getModuleById } from '../../lib/navigation/config';
import { useModuleResource } from '../../lib/hooks/queries/use-telecom';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { PermissionDenied } from '../data/PermissionDenied';
import { DataTable, type Column } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { FilterBar } from '../data/FilterBar';
import { SearchBar } from '../data/SearchBar';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18 },
};

type ModuleRow = Record<string, unknown> & { id: string };

function withIds(rows: Record<string, unknown>[]): ModuleRow[] {
  return rows.map((r, i) => ({
    ...r,
    id: String(r.id ?? r.uuid ?? `${i}`),
  }));
}

function getColumns(moduleId: string): Column<ModuleRow>[] {
  switch (moduleId) {
    case 'users':
      return [
        { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? r.displayName ?? '')}</span> },
        { key: 'email', header: 'Email', cell: (r) => String(r.email ?? '') },
        { key: 'role', header: 'Role', cell: (r) => <Badge variant="outline">{String(r.role ?? '')}</Badge> },
        { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'pending') as 'active'} /> },
      ];
    case 'devices':
      return [
        { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '') },
        { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.mac ?? r.macAddress ?? '')}</span> },
        { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
        { key: 'firmware', header: 'Firmware', cell: (r) => String(r.firmware ?? '—') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'offline') as 'online'} /> },
      ];
    case 'dids':
      return [
        { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono font-medium">{String(r.number ?? r.e164 ?? '')}</span> },
        { key: 'provider', header: 'Provider', cell: (r) => String(r.provider ?? r.carrier ?? '') },
        { key: 'assignedTo', header: 'Assigned To', cell: (r) => String(r.assignedTo ?? r.assignedExtension ?? '—') },
        { key: 'type', header: 'Type', cell: (r) => <Badge variant="outline">{String(r.type ?? '—')}</Badge> },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'pending') as 'active'} /> },
      ];
    case 'roles':
      return [
        { key: 'name', header: 'Role', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'users', header: 'Users', cell: (r) => String(r.users ?? r.userCount ?? '—') },
        { key: 'permissions', header: 'Permissions', cell: (r) => String(r.permissions ?? r.permissionCount ?? '—') },
        { key: 'system', header: 'Type', cell: (r) => <Badge variant="outline">{r.system ? 'System' : 'Custom'}</Badge> },
      ];
    case 'queues':
      return [
        { key: 'name', header: 'Queue', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'agents', header: 'Agents', cell: (r) => String(r.agents ?? r.agentCount ?? '—') },
        { key: 'waiting', header: 'Waiting', cell: (r) => String(r.waiting ?? r.waitingCount ?? '0') },
        { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '—') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'active') as 'active'} /> },
      ];
    case 'ivr':
      return [
        { key: 'name', header: 'IVR', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'extensions', header: 'Extension', cell: (r) => String(r.extension ?? r.extensions ?? '—') },
        { key: 'options', header: 'Options', cell: (r) => String(r.options ?? r.optionCount ?? '—') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'active') as 'active'} /> },
      ];
    case 'audit-logs':
      return [
        { key: 'action', header: 'Action', cell: (r) => String(r.action ?? '') },
        { key: 'actor', header: 'Actor', cell: (r) => String(r.actor ?? r.userId ?? '') },
        { key: 'time', header: 'Time', cell: (r) => <span className="text-muted-foreground">{String(r.time ?? r.createdAt ?? '')}</span> },
        { key: 'ip', header: 'IP', cell: (r) => <span className="font-mono text-xs">{String(r.ip ?? r.ipAddress ?? '—')}</span> },
      ];
    case 'cdr':
      return [
        { key: 'time', header: 'Time', cell: (r) => <span className="text-muted-foreground">{String(r.time ?? r.startedAt ?? '')}</span> },
        { key: 'direction', header: 'Direction', cell: (r) => String(r.direction ?? '') },
        { key: 'from', header: 'From', cell: (r) => <span className="font-mono text-xs">{String(r.from ?? r.caller ?? '')}</span> },
        { key: 'to', header: 'To', cell: (r) => String(r.to ?? r.callee ?? '') },
        { key: 'duration', header: 'Duration', cell: (r) => String(r.duration ?? r.durationSec ?? '') },
        { key: 'status', header: 'Status', cell: (r) => {
          const s = String(r.status ?? '');
          return <StatusBadge status={s === 'Completed' || s === 'completed' ? 'healthy' : s === 'Failed' || s === 'failed' ? 'error' : 'warning'} />;
        }},
      ];
    case 'sip-accounts':
      return [
        { key: 'username', header: 'Username', sortable: true, cell: (r) => <span className="font-mono text-xs">{String(r.username ?? '')}</span> },
        { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '—') },
        { key: 'domain', header: 'Domain', cell: (r) => String(r.domain ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'offline') as 'online'} /> },
      ];
    default:
      return [
        { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{String(r.name ?? r.label ?? r.id ?? '')}</span> },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'pending') === 'active' ? 'active' : 'pending'} /> },
        { key: 'updated', header: 'Updated', cell: (r) => String(r.updated ?? r.updatedAt ?? '—') },
      ];
  }
}

function getPrimaryAction(moduleId: string): string {
  const map: Record<string, string> = {
    users: 'Add User',
    devices: 'Provision Device',
    dids: 'Add DID',
    roles: 'Add Role',
    queues: 'Create Queue',
    ivr: 'Create IVR',
    'ring-groups': 'Create Ring Group',
    provisioning: 'Enroll Device',
  };
  return map[moduleId] ?? 'Create';
}

export function EnterpriseModulePage({ moduleId }: { moduleId: string }) {
  const module = getModuleById(moduleId);
  const permissions = usePermissions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const query = useModuleResource(moduleId);

  const rows = useMemo(() => withIds(query.data ?? []), [query.data]);

  const filtered = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    if (filter !== 'all') {
      list = list.filter((r) => String(r.status ?? '').toLowerCase() === filter);
    }
    return list;
  }, [rows, search, filter]);

  if (!module) return null;
  if (!hasPermission(permissions, module.permission)) {
    return (
      <PageContainer>
        <PermissionDenied module={module.label} />
      </PageContainer>
    );
  }

  const columns = getColumns(moduleId);

  return (
    <PageContainer>
      <motion.div {...fadeIn}>
        <PageHeader
          title={module.label}
          description={module.description}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button size="sm" disabled>
                <Plus className="h-4 w-4" />
                {getPrimaryAction(moduleId)}
              </Button>
            </div>
          }
        />

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={`Search ${module.label.toLowerCase()}…`}
            className="max-w-lg"
          />
          <FilterBar
            filters={[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'online', label: 'Online' },
              { id: 'pending', label: 'Pending' },
            ]}
            active={filter}
            onChange={setFilter}
          />
        </div>

        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!filtered.length}
          empty={
            <EmptyState
              title={`No ${module.label.toLowerCase()} yet`}
              description={`Data loads from the platform API when available.`}
              action={
                <Button disabled>
                  <Plus className="h-4 w-4" />
                  {getPrimaryAction(moduleId)}
                </Button>
              }
            />
          }
          skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        >
          <DataTable columns={columns} data={filtered} />
        </QueryState>
      </motion.div>
    </PageContainer>
  );
}
