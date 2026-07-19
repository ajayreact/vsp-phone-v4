'use client';

import type { SeriesPoint } from '../../../lib/noc/use-metric-series';
import { cn } from '../../../lib/utils/cn';

type SparklineChartProps = {
  title: string;
  points: SeriesPoint[];
  unit?: string;
  className?: string;
  color?: string;
};

export function SparklineChart({
  title,
  points,
  unit,
  className,
  color = 'currentColor',
}: SparklineChartProps) {
  const width = 320;
  const height = 120;
  const pad = 8;
  const values = points.map((p) => p.v);
  const latest = values.length ? values[values.length - 1] : null;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((p.v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });

  const path = coords.length ? `M ${coords.join(' L ')}` : '';

  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-lg font-semibold tabular-nums">
          {latest == null ? '—' : latest}
          {latest != null && unit ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
          ) : null}
        </p>
      </div>
      {points.length < 2 ? (
        <p className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          Collecting samples…
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[120px] w-full text-primary"
          role="img"
          aria-label={title}
        >
          <polyline
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="1"
            points={`${pad},${height - pad} ${width - pad},${height - pad}`}
          />
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
