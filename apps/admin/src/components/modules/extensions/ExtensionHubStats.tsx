'use client';

import { useMemo } from 'react';
import { useExtensionHub, useExtensionHubStats } from '../../../lib/hooks/queries/use-extension-hub';
import { Skeleton } from '../../ui/Skeleton';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

/** Compact inline summary — not a card grid. */
export function ExtensionHubStats() {
  const statsQuery = useExtensionHubStats();
  const hubQuery = useExtensionHub();

  const onlineCount = useMemo(
    () => (hubQuery.data ?? []).filter((r) => r.onlineStatus === 'Online').length,
    [hubQuery.data],
  );

  if (statsQuery.isLoading || hubQuery.isLoading) {
    return <Skeleton className="mb-4 h-9 w-full max-w-2xl rounded-lg" />;
  }

  const s = statsQuery.data;
  if (!s) return null;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3 text-sm"
      aria-label="Extension summary"
    >
      <Stat label="extensions" value={s.totalExtensions} />
      <span className="hidden text-border sm:inline" aria-hidden="true">
        |
      </span>
      <Stat label="online" value={onlineCount} />
      <Stat label="offline" value={s.offlineDevices} />
      <Stat label="needs setup" value={s.unassignedExtensions} />
      <Stat label="with DID" value={s.assignedDids} />
    </div>
  );
}
