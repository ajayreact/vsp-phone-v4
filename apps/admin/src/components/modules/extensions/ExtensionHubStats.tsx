'use client';

import { useMemo } from 'react';
import { Phone, Users, Wifi, WifiOff } from 'lucide-react';
import { useExtensionHub, useExtensionHubStats } from '../../../lib/hooks/queries/use-extension-hub';
import { MetricCard } from '../../data/MetricCard';
import { Skeleton } from '../../ui/Skeleton';

export function ExtensionHubStats() {
  const statsQuery = useExtensionHubStats();
  const hubQuery = useExtensionHub();

  const onlineCount = useMemo(
    () => (hubQuery.data ?? []).filter((r) => r.onlineStatus === 'Online').length,
    [hubQuery.data],
  );

  if (statsQuery.isLoading || hubQuery.isLoading) {
    return (
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const s = statsQuery.data;
  if (!s) return null;

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total Extensions" value={s.totalExtensions} icon={Users} />
      <MetricCard label="Online" value={onlineCount} icon={Wifi} />
      <MetricCard label="Offline" value={s.offlineDevices} icon={WifiOff} />
      <MetricCard label="Needs Setup" value={s.unassignedExtensions} icon={Phone} />
    </div>
  );
}
