'use client';

import { useState } from 'react';
import { useCreateTenantRoutingPolicy } from '../../lib/hooks/queries/use-tenant-mutations';
import { useTenantDevices, useTenantRouting } from '../../lib/hooks/queries/use-tenant';
import {
  useCreateDialPlan,
  useCreateHolidayCalendar,
  useCreateInboundRoute,
  useCreateOutboundRoute,
  useCreateTimeCondition,
  useDeleteDialPlan,
  useDeleteHolidayCalendar,
  useDeleteInboundRoute,
  useDeleteOutboundRoute,
  useDeleteTimeCondition,
  useDialPlans,
  useHolidayCalendars,
  useInboundRoutes,
  useOutboundRoutes,
  useRoutingMetrics,
  useTestDialPlan,
  useTestRoute,
  useTimeConditions,
} from '../../lib/hooks/queries/use-ivr-routing-mutations';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { usePermissions } from '../../lib/auth/AuthProvider';
import { StatusBadge } from '../ui/Badge';
import type { Column } from '../data/DataTable';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { ModuleAccessGate, ModuleListShell, withRowIds } from './shared/ModuleShell';
import { LineSelectCreateSlideOver, useLineOptionsFromDevices, WriteCreateButton } from './shared/TenantCreateForms';

type Row = Record<string, unknown> & { id: string };

const TABS = ['Policies', 'Inbound', 'Outbound', 'Dial Plans', 'Time Conditions', 'Holidays', 'Route Tester'] as const;

export type CallRoutingTab = (typeof TABS)[number];

export function CallRoutingContent({
  defaultTab,
  moduleId = 'call-routing',
}: {
  defaultTab?: CallRoutingTab;
  moduleId?: string;
}) {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_ROUTING_WRITE);

  const [tab, setTab] = useState<(typeof TABS)[number]>(defaultTab ?? 'Policies');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testDial, setTestDial] = useState('');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ name: '', pattern: '', timezone: 'America/New_York' });
  const [error, setError] = useState<string | null>(null);

  const policiesQuery = useTenantRouting();
  const devicesQuery = useTenantDevices();
  const inboundQuery = useInboundRoutes();
  const outboundQuery = useOutboundRoutes();
  const dialPlansQuery = useDialPlans();
  const timeQuery = useTimeConditions();
  const holidayQuery = useHolidayCalendars();
  const metricsQuery = useRoutingMetrics();

  const createPolicy = useCreateTenantRoutingPolicy();
  const createInbound = useCreateInboundRoute();
  const createOutbound = useCreateOutboundRoute();
  const createDialPlan = useCreateDialPlan();
  const createTime = useCreateTimeCondition();
  const createHoliday = useCreateHolidayCalendar();
  const deleteInbound = useDeleteInboundRoute();
  const deleteOutbound = useDeleteOutboundRoute();
  const deleteDialPlan = useDeleteDialPlan();
  const deleteTime = useDeleteTimeCondition();
  const deleteHoliday = useDeleteHolidayCalendar();
  const testRoute = useTestRoute();
  const testDialPlan = useTestDialPlan();

  const lineOptions = useLineOptionsFromDevices(devicesQuery.data ?? []);
  const policyRows = withRowIds(policiesQuery.data ?? []) as Row[];

  const policyColumns: Column<Row>[] = [
    { key: 'line', header: 'Line', cell: (r) => String((r.line as { name?: string })?.name ?? '—') },
    { key: 'inbound', header: 'Inbound', cell: (r) => <StatusBadge status={r.inboundEnabled === true ? 'active' : 'offline'} /> },
    { key: 'outbound', header: 'Outbound', cell: (r) => <StatusBadge status={r.outboundEnabled === true ? 'active' : 'offline'} /> },
  ];

  const simpleColumns = (onDelete?: (id: string) => void): Column<Row>[] => [
    { key: 'name', header: 'Name', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? '')}</span> },
    { key: 'priority', header: 'Priority', cell: (r) => String(r.priority ?? '—') },
    {
      key: 'enabled',
      header: 'Enabled',
      cell: (r) => <StatusBadge status={r.enabled !== false ? 'active' : 'offline'} />,
    },
    ...(canWrite && onDelete
      ? [{
          key: 'actions',
          header: '',
          cell: (r: Row) => (
            <Button variant="ghost" size="sm" onClick={() => void onDelete(r.id)}>Delete</Button>
          ),
        }]
      : []),
  ];

  const metrics = metricsQuery.data as Record<string, unknown> | undefined;

  const handleCreate = async () => {
    setError(null);
    try {
      if (tab === 'Inbound') {
        await createInbound.mutateAsync({ name: form.name, destinationType: 'IVR', priority: 100, enabled: true });
      } else if (tab === 'Outbound') {
        await createOutbound.mutateAsync({ name: form.name, pattern: form.pattern || '.*', priority: 100, enabled: true });
      } else if (tab === 'Dial Plans') {
        await createDialPlan.mutateAsync({ name: form.name, ruleType: 'NORMALIZATION', pattern: form.pattern || '^\\+1', replacement: '', priority: 100 });
      } else if (tab === 'Time Conditions') {
        await createTime.mutateAsync({ name: form.name, timezone: form.timezone, rules: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }] });
      } else if (tab === 'Holidays') {
        await createHoliday.mutateAsync({ name: form.name, holidays: [] });
      }
      setCreateOpen(false);
      setForm({ name: '', pattern: '', timezone: 'America/New_York' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const activeQuery = tab === 'Inbound' ? inboundQuery
    : tab === 'Outbound' ? outboundQuery
    : tab === 'Dial Plans' ? dialPlansQuery
    : tab === 'Time Conditions' ? timeQuery
    : tab === 'Holidays' ? holidayQuery
    : policiesQuery;

  const activeRows = withRowIds(
    tab === 'Policies' ? policyRows
    : tab === 'Inbound' ? (inboundQuery.data ?? [])
    : tab === 'Outbound' ? (outboundQuery.data ?? [])
    : tab === 'Dial Plans' ? (dialPlansQuery.data ?? [])
    : tab === 'Time Conditions' ? (timeQuery.data ?? [])
    : tab === 'Holidays' ? (holidayQuery.data ?? [])
    : [],
  ) as Row[];

  const activeColumns = tab === 'Policies' ? policyColumns
    : tab === 'Inbound' ? simpleColumns((id) => deleteInbound.mutate(id))
    : tab === 'Outbound' ? simpleColumns((id) => deleteOutbound.mutate(id))
    : tab === 'Dial Plans' ? simpleColumns((id) => deleteDialPlan.mutate(id))
    : tab === 'Time Conditions' ? simpleColumns((id) => deleteTime.mutate(id))
    : tab === 'Holidays' ? simpleColumns((id) => deleteHoliday.mutate(id))
    : policyColumns;

  return (
    <ModuleAccessGate moduleId={moduleId}>
      {({ module }) => (
        <>
          {metrics ? (
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ['Inbound Routes', metrics.inboundRoutes],
                  ['Outbound Routes', metrics.outboundRoutes],
                  ['Active IVRs', metrics.activeIvrs],
                  ['IVR Sessions Today', metrics.ivrSessionsToday],
                ] as [string, unknown][]
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{String(value ?? 0)}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button key={t} size="sm" variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)}>
                {t}
              </Button>
            ))}
          </div>

          {tab === 'Route Tester' ? (
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h3 className="font-medium">Route Tester</h3>
              <Input placeholder="Inbound phone number (DNIS)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Input placeholder="Dialed number (for dial plan test)" value={testDial} onChange={(e) => setTestDial(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={async () => {
                  const result = await testRoute.mutateAsync({ phoneNumber: testPhone });
                  setTestResult(result);
                }}>Test Inbound Route</Button>
                <Button variant="outline" onClick={async () => {
                  const result = await testDialPlan.mutateAsync(testDial);
                  setTestResult(result);
                }}>Test Dial Plan</Button>
              </div>
              {testResult ? (
                <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(testResult, null, 2)}</pre>
              ) : null}
            </div>
          ) : (
            <ModuleListShell
              module={module}
              query={{ ...activeQuery, data: activeRows }}
              columns={activeColumns}
              emptyTitle={`No ${tab.toLowerCase()}`}
              emptyDescription={`Configure ${tab.toLowerCase()} for your tenant.`}
              primaryAction={
                tab === 'Policies' ? (
                  <WriteCreateButton writePermission={PERMISSIONS.TENANT_ROUTING_WRITE} label="Add Policy" onClick={() => setPolicyOpen(true)} />
                ) : canWrite ? (
                  <WriteCreateButton writePermission={PERMISSIONS.TENANT_ROUTING_WRITE} label={`Add ${tab.slice(0, -1)}`} onClick={() => setCreateOpen(true)} />
                ) : undefined
              }
            />
          )}

          <LineSelectCreateSlideOver
            open={policyOpen}
            onClose={() => setPolicyOpen(false)}
            title="Add Routing Policy"
            description="Configure inbound and outbound call permissions for a line."
            isPending={createPolicy.isPending}
            lineOptions={lineOptions}
            onSubmit={async ({ lineId }) => {
              await createPolicy.mutateAsync({ lineId, inboundEnabled: true, outboundEnabled: true });
            }}
          />

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title={`Create ${tab.slice(0, -1)}`}>
            <div className="space-y-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {(tab === 'Outbound' || tab === 'Dial Plans') ? (
                <Input placeholder="Pattern" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
              ) : null}
              {tab === 'Time Conditions' ? (
                <Input placeholder="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              ) : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button onClick={() => void handleCreate()} disabled={!form.name}>Create</Button>
            </div>
          </SlideOver>
        </>
      )}
    </ModuleAccessGate>
  );
}
