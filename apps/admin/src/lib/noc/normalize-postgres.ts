import { asRecord, displayOrDash, formatLatency, pickNumber, pickString } from './payload';

export type PostgresViewModel = {
  status: string;
  healthTone: 'online' | 'warning' | 'offline';
  connections: string;
  queriesPerSec: string;
  replication: string;
  locks: string;
  cacheHit: string;
  latency: string;
  latencyMs: number | null;
};

export function normalizePostgresStats(data: Record<string, unknown> | null | undefined): PostgresViewModel {
  const status = pickString(data, ['status']) ?? 'unknown';
  const latencyMs = pickNumber(data, ['latencyMs', 'latency']);
  const connections =
    pickNumber(data, ['activeConnections', 'connections', 'poolSize', 'numbackends']) != null
      ? String(pickNumber(data, ['activeConnections', 'connections', 'poolSize', 'numbackends']))
      : null;
  const qps = pickNumber(data, ['queriesPerSec', 'tps', 'xact_commit']);
  const replication = pickString(data, ['replication', 'replicationState', 'is_in_recovery']);
  const locks = pickNumber(data, ['locks', 'lockCount']);
  const cacheHit =
    pickString(data, ['cacheHit', 'cache_hit_ratio']) ??
    (pickNumber(data, ['blks_hit', 'blks_read']) != null ? null : null);

  const healthTone =
    status === 'up' ? 'online' : status === 'degraded' ? 'warning' : status === 'down' ? 'offline' : 'warning';

  return {
    status: displayOrDash(status),
    healthTone,
    connections: displayOrDash(connections),
    queriesPerSec: qps != null ? String(qps) : '—',
    replication: displayOrDash(replication),
    locks: locks != null ? String(locks) : '—',
    cacheHit: displayOrDash(cacheHit),
    latency: formatLatency(latencyMs),
    latencyMs,
  };
}

export function postgresFieldRows(data: Record<string, unknown> | null | undefined) {
  const obj = asRecord(data) ?? {};
  return Object.entries(obj).map(([key, value], i) => ({
    id: `${key}-${i}`,
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'),
  }));
}
