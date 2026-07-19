'use client';

import { useMemo } from 'react';
import { normalizeKamailioDashboard } from '../../../lib/noc/normalize-kamailio';
import { useCounterRate, useMetricSeries } from '../../../lib/noc/use-metric-series';
import { NocStatGrid } from './NocStatGrid';
import { OpsSection } from './OpsSection';
import { RawJsonPanel } from './RawJsonPanel';
import { SparklineChart } from './SparklineChart';

export function KamailioOpsDashboard({
  data,
  registrationCount,
}: {
  data: Record<string, unknown>;
  registrationCount?: number | null;
}) {
  const view = useMemo(
    () => normalizeKamailioDashboard(data, registrationCount),
    [data, registrationCount],
  );
  const txRate = useCounterRate(view.transactionTotal);
  const registrationsSeries = useMetricSeries(view.activeRegistrations);
  const dialogsSeries = useMetricSeries(view.activeDialogs);
  const tpsSeries = useMetricSeries(txRate);

  return (
    <div className="space-y-6">
      <OpsSection title="Summary">
        <NocStatGrid
          items={[
            { label: 'Status', value: view.status, tone: view.healthTone },
            { label: 'Host', value: view.host },
            { label: 'Version', value: view.version },
            { label: 'Latency', value: view.latency },
            { label: 'Workers', value: view.workers },
            { label: 'Dispatcher', value: view.dispatcherStatus },
            { label: 'Registrations', value: view.activeRegistrations ?? '—' },
            { label: 'Dialogs', value: view.activeDialogs ?? '—' },
            {
              label: 'Transactions/sec',
              value: txRate ?? '—',
              hint: view.transactionTotal != null ? `Total ${view.transactionTotal}` : undefined,
            },
            { label: 'Persistence', value: view.persistence },
            { label: 'Restart Safe', value: view.restartSafe },
            { label: 'RPC Enabled', value: view.rpcEnabled },
            { label: 'Uptime', value: view.uptime },
            { label: 'Health', value: view.health, tone: view.healthTone },
          ]}
        />
      </OpsSection>
      <OpsSection title="Charts">
        <div className="grid gap-4 lg:grid-cols-3">
          <SparklineChart title="Registrations over time" points={registrationsSeries} />
          <SparklineChart title="Dialogs over time" points={dialogsSeries} />
          <SparklineChart title="Transactions/sec" points={tpsSeries} unit="/s" />
        </div>
      </OpsSection>
      <RawJsonPanel data={data} title="Show Raw RPC" />
    </div>
  );
}
