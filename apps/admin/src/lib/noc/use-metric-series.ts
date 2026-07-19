'use client';

import { useEffect, useRef, useState } from 'react';

export type SeriesPoint = { t: number; v: number };

const MAX_POINTS = 40;

/** Client-side rolling series for NOC charts (no backend history API). */
export function useMetricSeries(sample: number | null | undefined): SeriesPoint[] {
  const [points, setPoints] = useState<SeriesPoint[]>([]);

  useEffect(() => {
    if (sample == null || !Number.isFinite(sample)) return;
    const now = Date.now();
    setPoints((prev) => {
      const next = [...prev, { t: now, v: sample }];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, [sample]);

  return points;
}

/** Derive transactions/sec (or similar) from a monotonic counter across polls. */
export function useCounterRate(total: number | null | undefined): number | null {
  const last = useRef<{ total: number; at: number } | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    if (total == null || !Number.isFinite(total)) return;
    const now = Date.now();
    const prev = last.current;
    if (prev && total >= prev.total && now > prev.at) {
      const secs = (now - prev.at) / 1000;
      setRate(secs > 0 ? Math.round(((total - prev.total) / secs) * 10) / 10 : 0);
    }
    last.current = { total, at: now };
  }, [total]);

  return rate;
}
