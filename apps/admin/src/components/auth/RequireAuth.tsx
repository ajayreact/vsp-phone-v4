'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { detectPortal } from '../../lib/portal/detect-portal';
import { Skeleton } from '../ui/Skeleton';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const portal = detectPortal();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (session.portal && session.portal !== portal) {
      void logout().finally(() => router.replace('/login'));
    }
  }, [loading, session, router, portal, logout]);

  if (loading) {
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

  if (!session || (session.portal && session.portal !== portal)) return null;
  return <>{children}</>;
}
