'use client';

import { motion } from 'framer-motion';
import { CreditCard } from 'lucide-react';
import { getModuleById } from '../../lib/navigation/config';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { EmptyState } from '../data/EmptyState';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';

/** Billing module is intentionally deferred until core telecom ops are live. */
export function BillingContent() {
  const module = getModuleById('billing')!;
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
        <PageHeader title="Billing & Usage" description="Platform billing and carrier usage metrics." />
        <EmptyState
          title="Billing module deferred"
          description="Billing and usage reporting will be enabled after the telecom operations center modules are production-ready."
          icon={CreditCard}
        />
      </motion.div>
    </PageContainer>
  );
}
