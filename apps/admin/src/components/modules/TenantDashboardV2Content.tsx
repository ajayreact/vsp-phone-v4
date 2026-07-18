'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity,
  Phone,
  PhoneCall,
  PhoneMissed,
  RefreshCw,
  Smartphone,
  Voicemail,
} from 'lucide-react';
import { useExtensionHubStats } from '../../lib/hooks/queries/use-extension-hub';
import { useTenantDashboard } from '../../lib/hooks/queries/use-tenant';
import { ModuleAccessGate } from './shared/ModuleShell';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function TenantDashboardV2Content() {
  const query = useTenantDashboard();
  const hubStats = useExtensionHubStats();

  const todayCalls = (query.data?.activeCalls ?? 0) as number;
  const missed = (query.data as { missedCalls?: number })?.missedCalls ?? 0;
  const voicemail = (query.data as { voicemailCount?: number })?.voicemailCount ?? 0;

  return (
    <ModuleAccessGate moduleId="dashboard">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <PageHeader
              title="Dashboard"
              description="At-a-glance PBX health. Manage everything from Extensions."
              actions={
                <div className="flex flex-wrap gap-2">
                  <Link href="/extensions">
                    <Button size="sm">Open Extensions</Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                    <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              }
            />

            <QueryState
              isLoading={query.isLoading || hubStats.isLoading}
              isError={query.isError}
              error={query.error}
              onRetry={() => {
                void query.refetch();
                void hubStats.refetch();
              }}
              skeleton={<KpiSkeleton />}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Link href="/extensions" className="block transition-transform hover:scale-[1.01]">
                  <MetricCard label="Extensions" value={hubStats.data?.totalExtensions ?? 0} icon={Phone} />
                </Link>
                <Link href="/extensions" className="block transition-transform hover:scale-[1.01]">
                  <MetricCard
                    label="Devices"
                    value={(hubStats.data?.deskPhones ?? 0) + (hubStats.data?.mobileApps ?? 0)}
                    icon={Smartphone}
                  />
                </Link>
                <Link href="/extensions" className="block transition-transform hover:scale-[1.01]">
                  <MetricCard label="Phone Numbers" value={hubStats.data?.assignedDids ?? 0} icon={PhoneCall} />
                </Link>
                <MetricCard label="Today's Calls" value={todayCalls} icon={Activity} />
                <MetricCard label="Missed Calls" value={missed} icon={PhoneMissed} />
                <Link href="/communication/voicemail" className="block transition-transform hover:scale-[1.01]">
                  <MetricCard label="Voicemail" value={voicemail} icon={Voicemail} />
                </Link>
              </div>

              {(() => {
                const onboarding = (query.data as { onboarding?: { checklist: Array<{ id: string; label: string; done: boolean }>; percent: number } })
                  ?.onboarding;
                const checklist = onboarding?.checklist ?? [];
                const percent = onboarding?.percent ?? 0;
                const byId = Object.fromEntries(checklist.map((c) => [c.id, c.done]));
                const extTotal = hubStats.data?.totalExtensions ?? 0;
                const devices =
                  (hubStats.data?.deskPhones ?? 0) + (hubStats.data?.mobileApps ?? 0);
                const assigned = hubStats.data?.assignedDids ?? 0;
                return (
                  <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">Tenant Setup Progress</h3>
                      <span className="text-sm tabular-nums text-muted-foreground">{percent}%</span>
                    </div>
                    <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                    </div>
                    <ul className="grid gap-2 text-sm sm:grid-cols-2">
                      <li>Company {byId.company ? '✓' : '·'}</li>
                      <li>Location {byId.hours || byId.company ? '✓' : '·'}</li>
                      <li>Admin {byId.user ? '✓' : '·'}</li>
                      <li>
                        Extensions {extTotal} / {Math.max(extTotal, 10)}
                      </li>
                      <li>Devices {devices}</li>
                      <li>
                        Assigned Numbers {assigned} / {Math.max(assigned, 5)}
                      </li>
                      <li>Business Hours {byId.hours ? '✓' : '·'}</li>
                    </ul>
                    <div className="mt-4">
                      <Link href="/settings/company">
                        <Button size="sm" variant="outline">
                          Continue Setup
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })()}

              <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-3 font-semibold">Recent activity</h3>
                <p className="text-sm text-muted-foreground">
                  Registered devices: {hubStats.data?.registeredDevices ?? 0} · Offline:{' '}
                  {hubStats.data?.offlineDevices ?? 0} · Unassigned extensions:{' '}
                  {hubStats.data?.unassignedExtensions ?? 0}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Your working page is{' '}
                  <Link href="/extensions" className="font-medium text-primary underline">
                    Extensions
                  </Link>
                  . Configure display names, users, voicemail PINs, and scan QR codes without leaving the hub.
                </p>
              </div>
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
