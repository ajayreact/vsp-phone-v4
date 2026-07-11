'use client';

import { motion } from 'framer-motion';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MarketplaceApprovalQueue } from './marketplace/MarketplaceApprovalQueue';
import { PageContainer, PageHeader } from '../layout/PageHeader';

export function NumberRequestsContent() {
  return (
    <ModuleAccessGate moduleId="number-requests">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader title={module.label} description={module.description} />
            <MarketplaceApprovalQueue />
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
