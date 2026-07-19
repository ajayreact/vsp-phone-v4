import { asRecord, displayOrDash, formatLatency, pickNumber, pickString } from './payload';

export type RedisViewModel = {
  status: string;
  healthTone: 'online' | 'warning' | 'offline';
  memory: string;
  clients: string;
  keys: string;
  hitRate: string;
  latency: string;
  latencyMs: number | null;
  commandsPerSec: string;
  version: string;
};

export function normalizeRedisStats(data: Record<string, unknown> | null | undefined): RedisViewModel {
  const status = pickString(data, ['status']) ?? 'unknown';
  const latencyMs = pickNumber(data, ['latencyMs', 'latency']);
  const memory =
    pickString(data, ['usedMemory', 'used_memory_human', 'memory']) ??
    (pickNumber(data, ['used_memory']) != null ? String(pickNumber(data, ['used_memory'])) : null);
  const clients =
    pickNumber(data, ['connectedClients', 'connected_clients', 'clients']) != null
      ? String(pickNumber(data, ['connectedClients', 'connected_clients', 'clients']))
      : null;
  const keys =
    pickNumber(data, ['keys', 'dbsize', 'keyspace_keys']) != null
      ? String(pickNumber(data, ['keys', 'dbsize', 'keyspace_keys']))
      : null;
  const hits = pickNumber(data, ['keyspace_hits', 'hits']);
  const misses = pickNumber(data, ['keyspace_misses', 'misses']);
  let hitRate: string | null = null;
  if (hits != null && misses != null) {
    const total = hits + misses;
    hitRate = total > 0 ? `${Math.round((hits / total) * 100)}%` : '—';
  } else {
    hitRate = pickString(data, ['hitRate', 'hit_rate']);
  }
  const ops = pickNumber(data, ['instantaneous_ops_per_sec', 'opsPerSec', 'commandsPerSec']);

  const healthTone =
    status === 'up' ? 'online' : status === 'degraded' ? 'warning' : status === 'down' ? 'offline' : 'warning';

  return {
    status: displayOrDash(status),
    healthTone,
    memory: displayOrDash(memory),
    clients: displayOrDash(clients),
    keys: displayOrDash(keys),
    hitRate: displayOrDash(hitRate),
    latency: formatLatency(latencyMs),
    latencyMs,
    commandsPerSec: ops != null ? String(ops) : '—',
    version: displayOrDash(pickString(data, ['version', 'redis_version'])),
  };
}

export function redisFieldRows(data: Record<string, unknown> | null | undefined) {
  const obj = asRecord(data) ?? {};
  return Object.entries(obj).map(([key, value], i) => ({
    id: `${key}-${i}`,
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'),
  }));
}
