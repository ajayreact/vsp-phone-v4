'use client';

import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { getModuleById } from '../../lib/navigation/config';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { EmptyState } from '../data/EmptyState';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';

/** Tenants admin API ships after core telecom modules are production-ready. */
export function TenantsContent() {
  const module = getModuleById('tenants')!;
  const permissions = usePermissions();

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
        <PageHeader title="Tenants" description="Multi-tenant organizations on the VSP Phone platform." />
        <EmptyState
          title="Tenants module queued"
          description="Tenant administration will follow once Telnyx numbers, trunks, extensions, and live calls are fully operational."
          icon={Building2}
        />
      </motion.div>
    </PageContainer>
  );
}
