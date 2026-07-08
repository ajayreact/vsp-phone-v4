import { Injectable } from '@nestjs/common';

type MetricLabels = Record<string, string>;

interface HistogramState {
  sum: number;
  count: number;
  buckets: Map<number, number>;
}

/** Phase 15 — in-memory Prometheus-compatible metrics registry. */
@Injectable()
export class MetricsRegistryService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();
  private readonly startTime = Date.now();

  incCounter(name: string, labels: MetricLabels = {}, value = 1): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    this.gauges.set(this.key(name, labels), value);
  }

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.key(name, labels);
    const h = this.histograms.get(key) ?? { sum: 0, count: 0, buckets: new Map() };
    h.sum += value;
    h.count += 1;
    for (const bound of [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
      if (value <= bound) {
        h.buckets.set(bound, (h.buckets.get(bound) ?? 0) + 1);
      }
    }
    this.histograms.set(key, h);
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    lines.push('# HELP vsp_uptime_seconds API process uptime');
    lines.push('# TYPE vsp_uptime_seconds gauge');
    lines.push(`vsp_uptime_seconds ${(Date.now() - this.startTime) / 1000}`);

    for (const [key, value] of this.counters) {
      const { name, labelStr } = this.parseKey(key);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${labelStr} ${value}`);
    }
    for (const [key, value] of this.gauges) {
      const { name, labelStr } = this.parseKey(key);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labelStr} ${value}`);
    }
    for (const [key, h] of this.histograms) {
      const { name, labelStr } = this.parseKey(key);
      lines.push(`# TYPE ${name} histogram`);
      for (const [bound, count] of h.buckets) {
        lines.push(`${name}_bucket${labelStr.replace('}', `,le="${bound}"}`)} ${count}`);
      }
      lines.push(`${name}_sum${labelStr} ${h.sum}`);
      lines.push(`${name}_count${labelStr} ${h.count}`);
    }
    return lines.join('\n') + '\n';
  }

  private key(name: string, labels: MetricLabels): string {
    const parts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);
    return parts.length ? `${name}{${parts.join(',')}}` : name;
  }

  private parseKey(key: string): { name: string; labelStr: string } {
    const idx = key.indexOf('{');
    if (idx === -1) return { name: key, labelStr: '' };
    return { name: key.slice(0, idx), labelStr: key.slice(idx) };
  }
}
