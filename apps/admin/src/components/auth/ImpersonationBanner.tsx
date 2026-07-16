'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { platformPortalOrigin } from '../../lib/portal/portal-origins';
import { Button } from '../ui/Button';

export function ImpersonationBanner() {
  const { session, exitImpersonation } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!session?.impersonatorUserId) return null;

  const onExit = async () => {
    setBusy(true);
    try {
      const { handoffCode } = await exitImpersonation();
      window.location.href = `${platformPortalOrigin()}/impersonate?code=${encodeURIComponent(handoffCode)}&next=/tenants`;
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm sm:px-6">
      <p className="text-amber-950 dark:text-amber-100">
        Impersonating{' '}
        <span className="font-semibold">
          {session.tenant?.name || session.tenant?.slug || 'tenant'}
        </span>
        . Tenant data only — exit to return to the Platform Portal.
      </p>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void onExit()}>
        {busy ? 'Exiting…' : 'Exit Impersonation'}
      </Button>
    </div>
  );
}
