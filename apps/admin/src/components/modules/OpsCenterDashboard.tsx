'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Building2,
  Cable,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Radio,
  RefreshCw,
  Smartphone,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchOpsKpis, type OpsKpis } from '../../lib/api/ops';
import {
  mockBillingSummary,
  mockLiveCalls,
  mockSipTrunks,
  mockTelnyxNumbers,
  summarizeTelnyxInventory,
} from '../../lib/mock/telecom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { displayNameFromSession } from '../../lib/rbac/permissions';
import { MetricCard } from '../data/MetricCard';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { LiveIndicator } from '../ui/LiveIndicator';
import { StatusBadge } from '../ui/Badge';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

export function OpsCenterDashboard() {
  const { session } = useAuth();
  const [kpis, setKpis] = useState<OpsKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const telnyxSummary = summarizeTelnyxInventory(mockTelnyxNumbers);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOpsKpis(session?.tenantId);
    setKpis(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, [session?.tenantId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const displayName = session
    ? displayNameFromSession(session.email, session.profile)
    : 'Operator';

  const activeCalls = kpis?.source === 'live' ? kpis.activeCalls : mockLiveCalls.length;
  const registered = kpis?.source === 'live' ? kpis.registeredDevices : 128;
  const tenants = kpis?.source === 'live' ? kpis.onlineTenants : 4;
  const queues = kpis?.source === 'live' ? kpis.activeQueues : 2;

  return (
    <PageContainer>
      <motion.div {...fade}>
        <PageHeader
          title="Operations Center"
          description="Real-time PBX platform monitoring — carrier inventory, live calls, registrations, and infrastructure."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <LiveIndicator
                label={kpis?.source === 'live' ? 'Live telemetry' : 'Mock data'}
                status={kpis?.source === 'live' ? 'online' : 'degraded'}
              />
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link href="/telnyx-numbers">
                <Button size="sm">
                  <PhoneCall className="h-4 w-4" />
                  Telnyx Numbers
                </Button>
              </Link>
            </div>
          }
        />

        <p className="-mt-4 mb-6 text-xs text-muted-foreground">
          Welcome back, {displayName.split(' ')[0]} · Last updated {lastRefresh.toLocaleTimeString()}
        </p>

        {/* Live operations KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active Calls"
            value={loading ? '—' : activeCalls}
            hint="Across all tenants"
            change={activeCalls > 0 ? `${activeCalls} in progress` : 'No active calls'}
            changeType={activeCalls > 0 ? 'up' : undefined}
            icon={PhoneIncoming}
          />
          <MetricCard
            label="SIP Registrations"
            value={loading ? '—' : registered}
            hint="Devices online"
            icon={Smartphone}
          />
          <MetricCard
            label="Active Tenants"
            value={loading ? '—' : tenants}
            hint="Platform-wide"
            icon={Building2}
          />
          <MetricCard
            label="Queue Sessions"
            value={loading ? '—' : queues}
            hint="Calls in queue"
            icon={Users}
          />
        </div>

        {/* Carrier & inventory KPIs */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Telnyx Inventory"
            value={telnyxSummary.total}
            hint={`${telnyxSummary.available} available`}
            change={`$${telnyxSummary.monthlySpend.toFixed(0)}/mo`}
            icon={PhoneCall}
          />
          <MetricCard
            label="Assigned Numbers"
            value={telnyxSummary.assigned}
            hint={`${telnyxSummary.pending} pending/porting`}
            icon={Phone}
          />
          <MetricCard
            label="SIP Trunks"
            value={mockSipTrunks.length}
            hint={`${mockSipTrunks[0]?.inUse ?? 0}/${mockSipTrunks[0]?.channels ?? 0} channels in use`}
            icon={Cable}
          />
          <MetricCard
            label="Telnyx Carrier"
            value={
              kpis?.telnyxStatus === 'up'
                ? 'Healthy'
                : kpis?.telnyxStatus === 'degraded'
                  ? 'Degraded'
                  : kpis?.telnyxStatus === 'down'
                    ? 'Down'
                    : 'Checking'
            }
            hint={kpis?.source === 'live' ? 'Live probe' : 'Awaiting BFF token'}
            icon={Activity}
          />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          {/* Live calls */}
          <Card className="xl:col-span-2">
            <CardHeader
              title="Live Calls"
              action={
                <Link href="/live-calls">
                  <Button variant="ghost" size="sm">
                    View all
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
            <CardBody className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium">Direction</th>
                      <th className="pb-3 pr-4 font-medium">From</th>
                      <th className="pb-3 pr-4 font-medium">To</th>
                      <th className="pb-3 pr-4 font-medium">Tenant</th>
                      <th className="pb-3 pr-4 font-medium">Duration</th>
                      <th className="pb-3 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mockLiveCalls.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="py-3 pr-4">{c.direction}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{c.from}</td>
                        <td className="py-3 pr-4">{c.to}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{c.tenant}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{c.duration}</td>
                        <td className="py-3">
                          <StatusBadge status={c.state === 'Active' ? 'online' : 'warning'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* SIP trunk status */}
          <Card>
            <CardHeader
              title="SIP Trunks"
              action={
                <Link href="/trunks">
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              }
            />
            <CardBody className="space-y-3 pt-0">
              {mockSipTrunks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t.name}</p>
                    <StatusBadge status={t.status === 'healthy' ? 'healthy' : 'warning'} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{t.host}</p>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{t.inUse}/{t.channels} channels</span>
                    <span>{t.latencyMs}ms</span>
                  </div>
                </div>
              ))}
              <Link href="/carriers">
                <Button variant="outline" className="w-full" size="sm">
                  Carrier integrations
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Telnyx number inventory preview */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Telnyx Number Inventory"
              action={
                <Link href="/telnyx-numbers">
                  <Button variant="ghost" size="sm">
                    Manage inventory
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
            <CardBody className="pt-0">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total', value: telnyxSummary.total },
                  { label: 'Available', value: telnyxSummary.available },
                  { label: 'Assigned', value: telnyxSummary.assigned },
                  { label: 'Pending', value: telnyxSummary.pending },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-center">
                    <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Number</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium">Tenant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mockTelnyxNumbers.slice(0, 4).map((n) => (
                      <tr key={n.id}>
                        <td className="py-2.5 pr-4 font-mono text-xs">{n.number}</td>
                        <td className="py-2.5 pr-4">
                          <StatusBadge
                            status={
                              n.status === 'available'
                                ? 'active'
                                : n.status === 'assigned'
                                  ? 'online'
                                  : 'pending'
                            }
                          />
                        </td>
                        <td className="py-2.5 text-muted-foreground">{n.assignedTenant ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Billing snapshot */}
          <Card>
            <CardHeader
              title="Billing Snapshot"
              action={
                <Link href="/billing">
                  <Button variant="ghost" size="sm">Details</Button>
                </Link>
              }
            />
            <CardBody className="space-y-4 pt-0">
              <div>
                <p className="text-xs text-muted-foreground">{mockBillingSummary.currentPeriod}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  ${mockBillingSummary.platformMrr.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Platform MRR</p>
              </div>
              <div className="space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telnyx spend</span>
                  <span className="font-medium">${mockBillingSummary.telnyxSpend}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Usage minutes</span>
                  <span className="font-medium">{mockBillingSummary.usageMinutes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overage</span>
                  <span className="font-medium">{mockBillingSummary.overageMinutes.toLocaleString()} min</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Infrastructure strip */}
        <Card className="mt-6">
          <CardHeader
            title="Infrastructure Health"
            action={
              <Link href="/system-health">
                <Button variant="ghost" size="sm">
                  Open monitoring
                  <Radio className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            }
          />
          <CardBody className="pt-0">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {['API', 'Kamailio', 'Redis', 'PostgreSQL', 'RTPengine', 'Telnyx'].map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <StatusBadge
                    status={
                      name === 'Telnyx' && kpis?.telnyxStatus === 'up'
                        ? 'healthy'
                        : name === 'Telnyx'
                          ? 'warning'
                          : 'healthy'
                    }
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </motion.div>
    </PageContainer>
  );
}
