'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Headphones,
  Phone,
  PhoneCall,
  Smartphone,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { displayNameFromSession } from '../../lib/rbac/permissions';
import {
  dashboardKpis,
  mockHealthServices,
  mockRecentCalls,
} from '../../lib/mock/data';
import { MetricCard } from '../data/MetricCard';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

function MiniBarChart({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data, 1);
  return (
    <div>
      <p className="mb-3 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex h-24 items-end gap-1.5">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-primary/80 transition-all hover:bg-primary"
            style={{ height: `${(v / max) * 100}%`, minHeight: 4 }}
          />
        ))}
      </div>
    </div>
  );
}

export function DashboardContent() {
  const { session } = useAuth();
  const [adminHealth, setAdminHealth] = useState<'ok' | 'unknown'>('unknown');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => setAdminHealth(r.ok ? 'ok' : 'unknown'))
      .catch(() => setAdminHealth('unknown'));
  }, []);

  const displayName = session
    ? displayNameFromSession(session.email, session.profile)
    : 'Administrator';

  return (
    <PageContainer>
      <motion.div {...fade}>
        <PageHeader
          title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${displayName.split(' ')[0]}`}
          description="Real-time overview of your cloud phone system."
          actions={
            <Link href="/softphone">
              <Button variant="outline" size="sm">
                <Headphones className="h-4 w-4" />
                Open Softphone
              </Button>
            </Link>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Extensions" value={dashboardKpis.extensions} change="+12 this month" changeType="up" icon={Phone} />
          <MetricCard label="Users" value={dashboardKpis.users} change="+4 this week" changeType="up" icon={Users} />
          <MetricCard label="Devices Online" value={dashboardKpis.registeredPhones} hint={`${dashboardKpis.devices} total devices`} icon={Smartphone} />
          <MetricCard label="DIDs" value={dashboardKpis.dids} icon={PhoneCall} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Today's Calls" value={dashboardKpis.todaysCalls.toLocaleString()} change="+8.2% vs yesterday" changeType="up" icon={TrendingUp} />
          <MetricCard label="Failed Calls" value={dashboardKpis.failedCalls} change="-3 vs yesterday" changeType="down" icon={AlertTriangle} />
          <MetricCard label="Call Quality" value={dashboardKpis.callQuality} change="MOS 4.2" changeType="up" icon={Activity} />
          <MetricCard label="Admin Service" value={adminHealth === 'ok' ? 'Healthy' : 'Checking…'} icon={Activity} />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Recent Calls"
              action={
                <Link href="/cdr">
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
                      <th className="pb-3 pr-4 font-medium">Time</th>
                      <th className="pb-3 pr-4 font-medium">Direction</th>
                      <th className="pb-3 pr-4 font-medium">From</th>
                      <th className="pb-3 pr-4 font-medium">To</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mockRecentCalls.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="py-3 pr-4 text-muted-foreground">{r.time}</td>
                        <td className="py-3 pr-4">{r.direction}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{r.from}</td>
                        <td className="py-3 pr-4">{r.to}</td>
                        <td className="py-3">
                          <StatusBadge
                            status={r.status === 'Completed' ? 'healthy' : r.status === 'Failed' ? 'error' : 'warning'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="System Health" />
            <CardBody className="space-y-3">
              {mockHealthServices.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.latencyMs}ms · {s.uptime}</p>
                  </div>
                  <StatusBadge status={s.status === 'healthy' ? 'healthy' : s.status === 'warning' ? 'warning' : 'error'} />
                </div>
              ))}
              <Link href="/system-health">
                <Button variant="outline" className="w-full" size="sm">
                  Open monitoring
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card>
            <CardBody>
              <MiniBarChart label="Call volume (24h)" data={[42, 58, 45, 72, 68, 91, 84, 76, 88, 95, 82, 78]} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <MiniBarChart label="Registrations" data={[120, 122, 125, 128, 126, 130, 128, 132, 131, 128, 129, 128]} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <MiniBarChart label="Queue activity" data={[8, 12, 6, 14, 10, 18, 15, 11, 9, 16, 13, 10]} />
            </CardBody>
          </Card>
        </div>
      </motion.div>
    </PageContainer>
  );
}
