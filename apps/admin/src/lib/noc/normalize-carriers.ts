import { asArray, asRecord, formatLatency, pickNumber, pickString } from './payload';

export type CarrierRowView = {
  id: string;
  name: string;
  type: string;
  health: string;
  healthTone: 'online' | 'warning' | 'offline';
  latency: string;
  registration: string;
  optionsProbe: string;
  activeCalls: number;
  capacity: string;
  failures: number;
};

export type CarriersViewModel = {
  carriers: CarrierRowView[];
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  totalActiveCalls: number;
};

function healthTone(health: string): CarrierRowView['healthTone'] {
  const h = health.toLowerCase();
  if (h === 'up' || h === 'green' || h === 'healthy' || h === 'registered') return 'online';
  if (h === 'degraded' || h === 'yellow' || h === 'warning' || h === 'unregistered') return 'warning';
  return 'offline';
}

export function normalizeCarrierMonitoring(
  data: Record<string, unknown> | null | undefined,
): CarriersViewModel {
  const carriers = asArray(data?.carriers).map((raw, index) => {
    const c = asRecord(raw) ?? {};
    const health = pickString(c, ['health', 'status', 'registration']) ?? 'unknown';
    const capacity = asRecord(c.capacity);
    const total = pickNumber(capacity, ['total', 'channels']);
    const inUse = pickNumber(capacity, ['inUse', 'used', 'active']);
    const capacityLabel =
      total != null ? `${inUse ?? 0} / ${total}` : inUse != null ? String(inUse) : '—';

    return {
      id: pickString(c, ['id', 'name']) ?? `carrier-${index}`,
      name: pickString(c, ['name', 'id']) ?? `Carrier ${index + 1}`,
      type: pickString(c, ['type', 'carrier']) ?? '—',
      health,
      healthTone: healthTone(health),
      latency: formatLatency(pickNumber(c, ['latencyMs', 'latency'])),
      registration: pickString(c, ['registration', 'health']) ?? '—',
      optionsProbe: pickString(c, ['optionsProbe']) ?? '—',
      activeCalls: pickNumber(c, ['activeCalls', 'concurrentCalls']) ?? 0,
      capacity: capacityLabel,
      failures: pickNumber(c, ['failures']) ?? 0,
    } satisfies CarrierRowView;
  });

  return {
    carriers,
    healthyCount: carriers.filter((c) => c.healthTone === 'online').length,
    degradedCount: carriers.filter((c) => c.healthTone === 'warning').length,
    downCount: carriers.filter((c) => c.healthTone === 'offline').length,
    totalActiveCalls: carriers.reduce((sum, c) => sum + c.activeCalls, 0),
  };
}
