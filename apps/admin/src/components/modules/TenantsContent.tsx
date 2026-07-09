'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mockTenants } from '../../lib/mock/telecom';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation/config';
import { DataTable, type Column } from '../data/DataTable';
import { MetricCard } from '../data/MetricCard';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Badge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Building2, Phone, Users } from 'lucide-react';

type Row = Record<string, unknown> & { id: string };

const columns: Column<Row>[] = [
  { key: 'name', header: 'Tenant', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
  { key: 'plan', header: 'Plan', cell: (r) => <Badge variant="outline">{String(r.plan ?? '')}</Badge> },
  { key: 'extensions', header: 'Extensions', cell: (r) => String(r.extensions ?? '') },
  { key: 'users', header: 'Users', cell: (r) => String(r.users ?? '') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status === 'active' ? 'active' : 'pending'} /> },
];

export function TenantsContent() {
  const module = getModuleById('tenants')!;
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

  const rows = mockTenants as unknown as Row[];
  const totalExt = mockTenants.reduce((s, t) => s + t.extensions, 0);
  const totalUsers = mockTenants.reduce((s, t) => s + t.users, 0);

  return (
    <PageContainer>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        <PageHeader
          title="Tenants"
          description="Multi-tenant organizations on the VSP Phone platform."
          actions={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Create Tenant
            </Button>
          }
        />
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <MetricCard label="Active Tenants" value={mockTenants.filter((t) => t.status === 'active').length} icon={Building2} />
          <MetricCard label="Total Extensions" value={totalExt} icon={Phone} />
          <MetricCard label="Total Users" value={totalUsers} icon={Users} />
        </div>
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          emptyTitle="No tenants"
          emptyDescription="Create your first tenant organization."
          emptyAction={<Button><Plus className="h-4 w-4" />Create Tenant</Button>}
        />
      </motion.div>
    </PageContainer>
  );
}
