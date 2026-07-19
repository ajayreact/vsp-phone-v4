'use client';

import { useMemo } from 'react';
import { normalizeRtpengineDashboard } from '../../../lib/noc/normalize-rtpengine';
import { useMetricSeries } from '../../../lib/noc/use-metric-series';
import type { Column } from '../../data/DataTable';
import { DataTable } from '../../data/DataTable';
import { NocStatGrid } from './NocStatGrid';
import { OpsSection } from './OpsSection';
import { RawJsonPanel } from './RawJsonPanel';
import { SparklineChart } from './SparklineChart';

type SessionRow = ReturnType<typeof normalizeRtpengineDashboard>['sessionRows'][number];

export function RtpengineOpsDashboard({ data }: { data: Record<string, unknown> }) {
  const view = useMemo(() => normalizeRtpengineDashboard(data), [data]);
  const sessionsSeries = useMetricSeries(view.sessionCount);
  const lossNum = view.avgPacketLoss === '—' ? null : Number(String(view.avgPacketLoss).replace('%', ''));
  const mosNum = view.avgMos === '—' ? null : Number(view.avgMos);
  const lossSeries = useMetricSeries(Number.isFinite(lossNum) ? lossNum : null);
  const mosSeries = useMetricSeries(Number.isFinite(mosNum) ? mosNum : null);

  const cols: Column<SessionRow>[] = [
    { key: 'call', header: 'Call', cell: (r) => <span className="font-mono text-xs">{r.platformUuid}</span> },
    { key: 'mos', header: 'MOS', cell: (r) => r.mos },
    { key: 'loss', header: 'Packet Loss', cell: (r) => r.packetLoss },
    { key: 'jitter', header: 'Jitter', cell: (r) => r.jitter },
    { key: 'codec', header: 'Codec', cell: (r) => r.codec },
    { key: 'quality', header: 'Quality', cell: (r) => r.quality },
  ];

  return (
    <div className="space-y-6">
      {view.ngError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          NG control error: {view.ngError}
        </div>
      ) : null}
      <OpsSection title="Summary">
        <NocStatGrid
          items={[
            { label: 'Status', value: view.status, tone: view.healthTone },
            { label: 'Host', value: view.host },
            { label: 'Sessions', value: view.sessionCount },
            { label: 'Packet Loss', value: view.avgPacketLoss },
            { label: 'Jitter', value: view.avgJitter },
            { label: 'Ports', value: view.ports },
            { label: 'CPU', value: view.cpu },
            { label: 'MOS', value: view.avgMos },
            { label: 'Media Errors', value: view.mediaErrors },
            { label: 'SRTP Sessions', value: view.srtpSessions },
            { label: 'Transcoding', value: view.transcoding },
            { label: 'Health', value: view.health, tone: view.healthTone },
          ]}
        />
      </OpsSection>
      <OpsSection title="Charts">
        <div className="grid gap-4 lg:grid-cols-3">
          <SparklineChart title="Sessions over time" points={sessionsSeries} />
          <SparklineChart title="Packet loss %" points={lossSeries} unit="%" />
          <SparklineChart title="MOS" points={mosSeries} />
        </div>
      </OpsSection>
      <OpsSection title="Active Media Sessions">
        <DataTable columns={cols} data={view.sessionRows} pageSize={10} />
      </OpsSection>
      <RawJsonPanel data={data} title="Show Raw JSON" />
    </div>
  );
}
