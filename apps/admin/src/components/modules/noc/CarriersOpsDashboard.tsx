'use client';

import { useMemo } from 'react';
import { normalizeCarrierMonitoring } from '../../../lib/noc/normalize-carriers';
import { useMetricSeries } from '../../../lib/noc/use-metric-series';
import type { Column } from '../../data/DataTable';
import { DataTable } from '../../data/DataTable';
import { StatusBadge } from '../../ui/Badge';
import { NocStatGrid } from './NocStatGrid';
import { OpsSection } from './OpsSection';
import { RawJsonPanel } from './RawJsonPanel';
import { SparklineChart } from './SparklineChart';

type Row = ReturnType<typeof normalizeCarrierMonitoring>['carriers'][number] & { id: string };

export function CarriersOpsDashboard({ data }: { data: Record<string, unknown> }) {
  const view = useMemo(() => normalizeCarrierMonitoring(data), [data]);
  const callsSeries = useMetricSeries(view.totalActiveCalls);
  const healthySeries = useMetricSeries(view.healthyCount);
  const primary = view.carriers[0];

  const cols: Column<Row>[] = [
    { key: 'name', header: 'Carrier', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'type', header: 'Type', cell: (r) => r.type },
    { key: 'health', header: 'Health', cell: (r) => <StatusBadge status={r.healthTone} /> },
    { key: 'latency', header: 'Latency', cell: (r) => r.latency },
    { key: 'registration', header: 'Registration / API', cell: (r) => r.registration },
    { key: 'options', header: 'OPTIONS / Webhook', cell: (r) => r.optionsProbe },
    { key: 'calls', header: 'Active Calls', cell: (r) => r.activeCalls },
    { key: 'capacity', header: 'SIP Trunks / Channels', cell: (r) => r.capacity },
    { key: 'failures', header: 'Failures', cell: (r) => r.failures },
  ];

  const rows: Row[] = view.carriers.map((c) => ({ ...c, id: c.id }));

  return (
    <div className="space-y-6">
      <OpsSection title="Summary">
        <NocStatGrid
          items={[
            { label: 'Carriers', value: view.carriers.length },
            { label: 'API / Health', value: primary?.health ?? '—', tone: primary?.healthTone },
            { label: 'Webhook / OPTIONS', value: primary?.optionsProbe ?? '—' },
            { label: 'Latency', value: primary?.latency ?? '—' },
            { label: 'Active Calls', value: view.totalActiveCalls },
            { label: 'SIP Trunks', value: view.carriers.length },
            { label: 'Healthy', value: view.healthyCount, tone: 'online' },
            { label: 'Degraded', value: view.degradedCount, tone: 'warning' },
            { label: 'Down', value: view.downCount, tone: view.downCount > 0 ? 'offline' : 'online' },
          ]}
        />
      </OpsSection>
      <OpsSection title="Charts">
        <div className="grid gap-4 lg:grid-cols-2">
          <SparklineChart title="Healthy carriers over time" points={healthySeries} />
          <SparklineChart title="Active calls over time" points={callsSeries} />
        </div>
      </OpsSection>
      <OpsSection title="Carrier Table">
        <DataTable columns={cols} data={rows} pageSize={10} />
      </OpsSection>
      <RawJsonPanel data={data} title="Show Raw Diagnostics" />
    </div>
  );
}
