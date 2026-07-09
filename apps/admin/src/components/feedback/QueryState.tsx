'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';

export function ApiErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 px-8 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function QueryState({
  isLoading,
  isError,
  error,
  isEmpty,
  empty,
  onRetry,
  children,
  skeleton,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isEmpty?: boolean;
  empty?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
  skeleton?: ReactNode;
}) {
  if (isLoading) return <>{skeleton ?? null}</>;
  if (isError) {
    return (
      <ApiErrorState
        message={error?.message ?? 'An unexpected error occurred.'}
        onRetry={onRetry}
      />
    );
  }
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
