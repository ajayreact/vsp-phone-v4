'use client';

import { useMemo } from 'react';
import { normalizePostgresStats, postgresFieldRows } from '../../../lib/noc/normalize-postgres';
import { useMetricSeries } from '../../../lib/noc/use-metric-series';
import type { Column } from '../../data/DataTable';
import { DataTable } from '../../data/DataTable';
import { NocStatGrid } from './NocStatGrid';
import { OpsSection } from './OpsSection';
import { RawJsonPanel } from './RawJsonPanel';
import { SparklineChart } from './SparklineChart';

export function PostgresOpsDashboard({ data }: { data: Record<string, unknown> }) {
  const view = useMemo(() => normalizePostgresStats(data), [data]);
  const latencySeries = useMetricSeries(view.latencyMs);
  const rows = useMemo(() => postgresFieldRows(data), [data]);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'key', header: 'Field', cell: (r) => <span className="font-mono text-xs">{r.key}</span> },
    { key: 'value', header: 'Value', cell: (r) => <span className="text-xs">{r.value}</span> },
  ];

  return (
    <div className="space-y-6">
      <OpsSection title="Summary">
        <NocStatGrid
          items={[
            { label: 'Status', value: view.status, tone: view.healthTone },
            { label: 'Connections', value: view.connections },
            { label: 'Queries/sec', value: view.queriesPerSec },
            { label: 'Replication', value: view.replication },
            { label: 'Locks', value: view.locks },
            { label: 'Cache Hit', value: view.cacheHit },
            { label: 'Latency', value: view.latency },
          ]}
        />
      </OpsSection>
      <OpsSection title="Charts" description="Client-side samples from live polls.">
        <div className="grid gap-4 lg:grid-cols-2">
          <SparklineChart title="Latency" points={latencySeries} unit="ms" />
        </div>
      </OpsSection>
      <OpsSection title="Diagnostics Fields">
        <DataTable columns={cols} data={rows} pageSize={12} />
      </OpsSection>
      <RawJsonPanel data={data} title="Show Raw Diagnostics" />
    </div>
  );
}
