'use client';

import {
  Download,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getModuleById } from '../../lib/navigation/config';
import { getMockRows } from '../../lib/mock/data';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { PermissionDenied } from '../data/PermissionDenied';
import { DataTable, type Column } from '../data/DataTable';
import { FilterBar } from '../data/FilterBar';
import { SearchBar } from '../data/SearchBar';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Badge } from '../ui/Badge';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18 },
};

type ModuleRow = Record<string, unknown> & { id: string };

function getColumns(moduleId: string): Column<ModuleRow>[] {
  switch (moduleId) {
    case 'users':
      return [
        { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'email', header: 'Email', cell: (r) => String(r.email ?? '') },
        { key: 'role', header: 'Role', cell: (r) => <Badge variant="outline">{String(r.role ?? '')}</Badge> },
        { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'active'} /> },
      ];
    case 'extensions':
      return [
        { key: 'extension', header: 'Extension', sortable: true, cell: (r) => <span className="font-mono font-medium">{String(r.extension ?? '')}</span> },
        { key: 'name', header: 'Name', cell: (r) => String(r.name ?? '') },
        { key: 'device', header: 'Device', cell: (r) => String(r.device ?? '') },
        { key: 'site', header: 'Site', cell: (r) => String(r.site ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'online' ? 'online' : 'offline'} /> },
      ];
    case 'devices':
      return [
        { key: 'model', header: 'Model', cell: (r) => String(r.model ?? '') },
        { key: 'mac', header: 'MAC', cell: (r) => <span className="font-mono text-xs">{String(r.mac ?? '')}</span> },
        { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '') },
        { key: 'firmware', header: 'Firmware', cell: (r) => String(r.firmware ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'online'} /> },
      ];
    case 'dids':
      return [
        { key: 'number', header: 'Number', sortable: true, cell: (r) => <span className="font-mono font-medium">{String(r.number ?? '')}</span> },
        { key: 'provider', header: 'Provider', cell: (r) => String(r.provider ?? '') },
        { key: 'assignedTo', header: 'Assigned To', cell: (r) => String(r.assignedTo ?? '') },
        { key: 'type', header: 'Type', cell: (r) => <Badge variant="outline">{String(r.type ?? '')}</Badge> },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'active'} /> },
      ];
    case 'roles':
      return [
        { key: 'name', header: 'Role', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'users', header: 'Users', cell: (r) => String(r.users ?? '') },
        { key: 'permissions', header: 'Permissions', cell: (r) => String(r.permissions ?? '') },
        { key: 'system', header: 'Type', cell: (r) => <Badge variant="outline">{r.system ? 'System' : 'Custom'}</Badge> },
      ];
    case 'queues':
      return [
        { key: 'name', header: 'Queue', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'agents', header: 'Agents', cell: (r) => String(r.agents ?? '') },
        { key: 'waiting', header: 'Waiting', cell: (r) => String(r.waiting ?? '') },
        { key: 'strategy', header: 'Strategy', cell: (r) => String(r.strategy ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'active'} /> },
      ];
    case 'ivr':
      return [
        { key: 'name', header: 'IVR', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'extensions', header: 'Extension', cell: (r) => String(r.extensions ?? '') },
        { key: 'options', header: 'Options', cell: (r) => String(r.options ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'active'} /> },
      ];
    case 'audit-logs':
      return [
        { key: 'action', header: 'Action', cell: (r) => String(r.action ?? '') },
        { key: 'actor', header: 'Actor', cell: (r) => String(r.actor ?? '') },
        { key: 'time', header: 'Time', cell: (r) => <span className="text-muted-foreground">{String(r.time ?? '')}</span> },
        { key: 'ip', header: 'IP', cell: (r) => <span className="font-mono text-xs">{String(r.ip ?? '')}</span> },
      ];
    case 'cdr':
      return [
        { key: 'time', header: 'Time', cell: (r) => <span className="text-muted-foreground">{String(r.time ?? '')}</span> },
        { key: 'direction', header: 'Direction', cell: (r) => String(r.direction ?? '') },
        { key: 'from', header: 'From', cell: (r) => <span className="font-mono text-xs">{String(r.from ?? '')}</span> },
        { key: 'to', header: 'To', cell: (r) => String(r.to ?? '') },
        { key: 'duration', header: 'Duration', cell: (r) => String(r.duration ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'Completed' ? 'healthy' : r.status === 'Failed' ? 'error' : 'warning'} /> },
      ];
    case 'sip-accounts':
      return [
        { key: 'username', header: 'Username', sortable: true, cell: (r) => <span className="font-mono text-xs">{String(r.username ?? '')}</span> },
        { key: 'extension', header: 'Extension', cell: (r) => String(r.extension ?? '') },
        { key: 'domain', header: 'Domain', cell: (r) => String(r.domain ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'online'} /> },
      ];
    case 'trunks':
      return [
        { key: 'name', header: 'Trunk', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'carrier', header: 'Carrier', cell: (r) => String(r.carrier ?? '') },
        { key: 'channels', header: 'Channels', cell: (r) => String(r.channels ?? '') },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status as 'active'} /> },
      ];
    default:
      return [
        { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
        { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'active' ? 'active' : 'pending'} /> },
        { key: 'updated', header: 'Updated', cell: (r) => String(r.updated ?? '') },
      ];
  }
}

function getPrimaryAction(moduleId: string): string {
  const map: Record<string, string> = {
    users: 'Add User',
    extensions: 'Add Extension',
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, [moduleId]);

  const rows = useMemo(() => getMockRows(moduleId), [moduleId]);
  const filtered = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    if (filter !== 'all') {
      list = list.filter((r) => (r as { status?: string }).status === filter);
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
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button size="sm">
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

        <DataTable
          columns={columns}
          data={filtered as ModuleRow[]}
          loading={loading}
          emptyTitle={`No ${module.label.toLowerCase()} yet`}
          emptyDescription={`Create your first ${module.label.toLowerCase().replace(/s$/, '')} to get started.`}
          emptyAction={
            <Button>
              <Plus className="h-4 w-4" />
              {getPrimaryAction(moduleId)}
            </Button>
          }
        />
      </motion.div>
    </PageContainer>
  );
}
