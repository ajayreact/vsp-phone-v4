'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth/AuthProvider';
import { detectPortal } from '../../../lib/portal/detect-portal';
import { isExtensionHubEnabled } from '../../../lib/feature-flags';
import { Skeleton } from '../../../components/ui/Skeleton';

function ImpersonateHandoffInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { acceptImpersonationHandoff } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const next = params.get('next');
    if (!code) {
      setError('Missing impersonation code');
      return;
    }
    void acceptImpersonationHandoff(code)
      .then(() => {
        const portal = detectPortal();
        if (next?.startsWith('/')) {
          router.replace(next);
          return;
        }
        if (portal === 'platform') {
          router.replace('/tenants');
          return;
        }
        const landing = isExtensionHubEnabled() ? '/extensions' : '/dashboard';
        router.replace(landing);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Impersonation failed');
      });
  }, [params, acceptImpersonationHandoff, router]);

  if (error) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="font-semibold text-destructive">Unable to complete session handoff</p>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <a href="/login" className="mt-4 inline-block text-primary underline">
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full" />
      <p className="text-sm text-muted-foreground">Completing secure session handoff…</p>
    </div>
  );
}

export default function ImpersonateHandoffPage() {
  return (
    <Suspense fallback={<Skeleton className="h-8 w-56" />}>
      <ImpersonateHandoffInner />
    </Suspense>
  );
}
