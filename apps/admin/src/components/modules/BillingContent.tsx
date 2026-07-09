'use client';

import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { mockBillingSummary, mockTenants } from '../../lib/mock/telecom';
import { hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { getModuleById } from '../../lib/navigation/config';
import { MetricCard } from '../data/MetricCard';
import { PermissionDenied } from '../data/PermissionDenied';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { CreditCard, PhoneCall, TrendingUp } from 'lucide-react';

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
        <PageHeader
          title="Billing & Usage"
          description={`Current period: ${mockBillingSummary.currentPeriod}`}
          actions={
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export invoice
            </Button>
          }
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Platform MRR" value={`$${mockBillingSummary.platformMrr.toLocaleString()}`} icon={CreditCard} change="+4.2%" changeType="up" />
          <MetricCard label="Telnyx Spend" value={`$${mockBillingSummary.telnyxSpend}`} icon={PhoneCall} hint="Carrier costs" />
          <MetricCard label="Usage Minutes" value={mockBillingSummary.usageMinutes.toLocaleString()} icon={TrendingUp} />
          <MetricCard label="Overage" value={`${mockBillingSummary.overageMinutes.toLocaleString()} min`} change="Above plan" changeType="down" />
        </div>

        <Card>
          <CardHeader title="Per-tenant usage" />
          <CardBody className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Tenant</th>
                    <th className="pb-3 pr-4 font-medium">Plan</th>
                    <th className="pb-3 pr-4 font-medium">Extensions</th>
                    <th className="pb-3 pr-4 font-medium">Est. MRR</th>
                    <th className="pb-3 font-medium">Telnyx numbers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="py-3 pr-4 font-medium">{t.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{t.plan}</td>
                      <td className="py-3 pr-4">{t.extensions}</td>
                      <td className="py-3 pr-4 tabular-nums">
                        ${t.plan === 'Enterprise' ? '12,400' : t.plan === 'Business' ? '4,800' : '0'}
                      </td>
                      <td className="py-3 tabular-nums">{t.name === 'Acme Corp' ? 2 : t.name === 'Globex Inc' ? 1 : 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </motion.div>
    </PageContainer>
  );
}
