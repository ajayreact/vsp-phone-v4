'use client';

import Link from 'next/link';
import { ModuleAccessGate } from '../shared/ModuleShell';
import { PageContainer, PageHeader } from '../../layout/PageHeader';
import { Button } from '../../ui/Button';

/**
 * Legacy guided wizard retired under Extension Workspace (V5).
 * Platform assigns DIDs → extensions auto-provision; tenant finishes setup in Configure.
 */
export function ProvisionEmployeeWizard() {
  return (
    <ModuleAccessGate moduleId="provision-employee">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title={module.label}
            description="This wizard has been replaced by the Extensions workspace."
          />
          <div className="max-w-lg space-y-4 rounded-2xl border border-border bg-muted/20 p-6 text-sm">
            <p className="font-medium text-foreground">How to onboard an employee</p>
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>Platform Admin assigns a DID to your tenant (creates extension 100, 101, …).</li>
              <li>Open Extensions → Configure on that row.</li>
              <li>Set Identity & User, Softphone, Desk Phone, Voicemail, and Permissions.</li>
            </ol>
            <Link href="/extensions">
              <Button>Go to Extensions</Button>
            </Link>
          </div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
