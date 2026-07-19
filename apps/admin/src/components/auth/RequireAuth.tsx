'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getAccessToken } from '../../lib/auth/session';
import { detectPortal } from '../../lib/portal/detect-portal';
import { Skeleton } from '../ui/Skeleton';

function AuthLoadingSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const portal = detectPortal();
  const tokenExists = typeof window !== 'undefined' ? Boolean(getAccessToken()) : false;

  // Token present but session not committed yet (login → setSession → router.replace race).
  const awaitingSession = tokenExists && session === null;

  useEffect(() => {
    if (loading || awaitingSession) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (session.portal && session.portal !== portal) {
      void logout().finally(() => router.replace('/login'));
    }
  }, [loading, awaitingSession, session, router, portal, logout]);

  if (loading || awaitingSession) {
    return <AuthLoadingSkeleton />;
  }

  if (!session || (session.portal && session.portal !== portal)) return null;
  return <>{children}</>;
}
