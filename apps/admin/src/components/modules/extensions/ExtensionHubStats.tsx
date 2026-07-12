'use client';

import { Phone, PhoneCall, Smartphone, Monitor, Wifi, WifiOff, Users } from 'lucide-react';
import { useExtensionHubStats } from '../../../lib/hooks/queries/use-extension-hub';
import { MetricCard } from '../../data/MetricCard';
import { Skeleton } from '../../ui/Skeleton';

export function ExtensionHubStats() {
  const statsQuery = useExtensionHubStats();

  if (statsQuery.isLoading) {
    return (
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const s = statsQuery.data;
  if (!s) return null;

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      <MetricCard label="Total Extensions" value={s.totalExtensions} icon={Users} />
      <MetricCard label="Assigned DIDs" value={s.assignedDids} icon={PhoneCall} />
      <MetricCard label="Registered Devices" value={s.registeredDevices} icon={Wifi} />
      <MetricCard label="Offline Devices" value={s.offlineDevices} icon={WifiOff} />
      <MetricCard label="Unassigned Extensions" value={s.unassignedExtensions} icon={Phone} />
      <MetricCard label="Mobile Apps" value={s.mobileApps} icon={Smartphone} />
      <MetricCard label="Desk Phones" value={s.deskPhones} icon={Monitor} />
    </div>
  );
}
