'use client';

import { useMemo } from 'react';
import {
  healthLatencySample,
  normalizePlatformHealth,
  cardNumeric,
} from '../../../lib/noc/normalize-platform-health';
import { useMetricSeries } from '../../../lib/noc/use-metric-series';
import type { InfraHealthCheck } from '../../../types/telecom';
import { StatusBadge } from '../../ui/Badge';
import { NocStatGrid } from './NocStatGrid';
import { OpsSection } from './OpsSection';
import { RawJsonPanel } from './RawJsonPanel';
import { SparklineChart } from './SparklineChart';

export function PlatformHealthDashboard({
  components,
  concurrentCalls,
  registrations,
  alertCount,
  raw,
}: {
  components: Record<string, InfraHealthCheck | undefined> | null | undefined;
  concurrentCalls?: number | null;
  registrations?: number | null;
  alertCount?: number | null;
  raw?: unknown;
}) {
  const cards = useMemo(() => normalizePlatformHealth(components), [components]);
  const cpu = cardNumeric(cards, 'cpu');
  const memory = cardNumeric(cards, 'memory');
  const latency = healthLatencySample(cards);
  const callsSeries = useMetricSeries(concurrentCalls ?? null);
  const regSeries = useMetricSeries(registrations ?? null);
  const cpuSeries = useMetricSeries(cpu);
  const memSeries = useMetricSeries(memory);
  const latencySeries = useMetricSeries(latency);

  const summary = [
    ...cards.map((c) => ({
      label: c.name,
      value: c.detail,
      tone: c.tone,
      hint: c.status,
    })),
    { label: 'Concurrent Calls', value: concurrentCalls ?? '—' },
    { label: 'Registrations', value: registrations ?? '—' },
    { label: 'Alerts', value: alertCount ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <OpsSection title="Platform Health" description="Operator summary of core infrastructure probes.">
        <NocStatGrid items={summary} />
      </OpsSection>
      <OpsSection title="Charts">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SparklineChart title="Registrations" points={regSeries} />
          <SparklineChart title="Calls" points={callsSeries} />
          <SparklineChart title="CPU" points={cpuSeries} />
          <SparklineChart title="Memory %" points={memSeries} unit="%" />
          <SparklineChart title="Avg Latency" points={latencySeries} unit="ms" />
        </div>
      </OpsSection>
      <OpsSection title="Component Table">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Component</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cards.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.tone} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.detail}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {c.latencyMs != null ? `${c.latencyMs} ms` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsSection>
      {raw != null ? <RawJsonPanel data={raw} title="Show Raw Diagnostics" /> : null}
    </div>
  );
}
