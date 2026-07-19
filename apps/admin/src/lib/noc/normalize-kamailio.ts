import {
  asArray,
  asRecord,
  displayOrDash,
  formatLatency,
  formatUptime,
  pickNumber,
  pickString,
} from './payload';

export type KamailioViewModel = {
  status: string;
  host: string;
  version: string;
  latency: string;
  rpcEnabled: string;
  uptime: string;
  workers: string;
  activeRegistrations: number | null;
  activeDialogs: number | null;
  transactionsPerSec: number | null;
  transactionTotal: number | null;
  dispatcherStatus: string;
  persistence: string;
  restartSafe: string;
  health: string;
  healthTone: 'online' | 'warning' | 'offline';
};

export function normalizeKamailioDashboard(
  data: Record<string, unknown> | null | undefined,
  registrationCount?: number | null,
): KamailioViewModel {
  const nodes = asArray(data?.nodes).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const primary = nodes[0] ?? null;
  const upNodes = nodes.filter((n) => String(n.status ?? '').toLowerCase() === 'up').length;
  const rpcEnabled = Boolean(data?.rpcConfigured);
  const latencyMs = pickNumber(primary, ['latencyMs', 'latency', 'rtt']);
  const host =
    (primary
      ? `${pickString(primary, ['host', 'id']) ?? 'kamailio'}${
          pickNumber(primary, ['port']) != null ? `:${pickNumber(primary, ['port'])}` : ''
        }`
      : null) ?? '—';

  const dialogStats = data?.dialogStats ?? data?.dialogs;
  const activeDialogs =
    pickNumber(dialogStats, ['active', 'dialogs', 'current', 'dlg_active', 'value']) ?? null;

  const tm = data?.transactionStats ?? data?.tm;
  const transactionTotal =
    pickNumber(tm, ['total', 'transactions', 'total_local', 'received', 'current']) ?? null;
  const workers =
    pickNumber(data?.workers, ['count', 'workers', 'processes', 'value']) ??
    pickNumber(data, ['workers', 'worker_count', 'children']);

  const persistence = asRecord(data?.persistence);
  const persistenceMode = pickString(persistence, ['mode', 'detail']) ?? '—';
  const restartSafe = persistence?.restartSafe === true;
  const version =
    pickString(data, ['version']) ??
    pickString(data?.uptime, ['version']) ??
    pickString(primary, ['version']) ??
    pickString(data?.shmmem, ['version']) ??
    '—';

  const dispatcher = data?.dispatcher ?? data?.gateways;
  const dispatcherNodes = countDispatcherNodes(dispatcher);
  const dispatcherStatus =
    dispatcherNodes.total > 0
      ? `${dispatcherNodes.up}/${dispatcherNodes.total} up`
      : nodes.length > 0
        ? `${upNodes}/${nodes.length} nodes up`
        : '—';

  let health = 'unknown';
  let healthTone: KamailioViewModel['healthTone'] = 'warning';
  if (!rpcEnabled) {
    health = 'RPC not configured';
    healthTone = 'warning';
  } else if (nodes.length > 0 && upNodes === 0) {
    health = 'down';
    healthTone = 'offline';
  } else if (nodes.length > 0 && upNodes < nodes.length) {
    health = 'degraded';
    healthTone = 'warning';
  } else if (rpcEnabled) {
    health = restartSafe ? 'healthy' : 'healthy (memory usrloc)';
    healthTone = restartSafe ? 'online' : 'warning';
  }

  const nodeStatus = pickString(primary, ['status']) ?? (rpcEnabled ? 'up' : 'unknown');

  return {
    status: displayOrDash(nodeStatus),
    host,
    version: displayOrDash(version),
    latency: formatLatency(latencyMs),
    rpcEnabled: rpcEnabled ? 'Enabled' : 'Disabled',
    uptime: formatUptime(data?.uptime),
    workers: workers != null ? String(workers) : '—',
    activeRegistrations: registrationCount ?? null,
    activeDialogs,
    transactionsPerSec: null, // filled by client-side series rate
    transactionTotal,
    dispatcherStatus,
    persistence: persistenceMode,
    restartSafe: restartSafe ? 'Yes' : persistence ? 'No' : '—',
    health,
    healthTone,
  };
}

function countDispatcherNodes(dispatcher: unknown): { up: number; total: number } {
  const root = asRecord(dispatcher);
  const sets = asArray(root?.SETS ?? root?.sets ?? root?.DESTINATION ?? dispatcher);
  let up = 0;
  let total = 0;
  for (const set of sets) {
    const setObj = asRecord(set);
    const targets = asArray(setObj?.TARGETS ?? setObj?.targets ?? setObj?.DESTINATIONS ?? set);
    for (const t of targets) {
      const target = asRecord(t) ?? asRecord(asRecord(t)?.DEST ?? asRecord(t)?.dest);
      if (!target && typeof t !== 'object') continue;
      total += 1;
      const flags = pickString(target, ['FLAGS', 'flags', 'status', 'state']) ?? '';
      const inactive = /i|down|inactive|off/i.test(flags);
      if (!inactive) up += 1;
    }
  }
  if (total === 0 && root) {
    const n = pickNumber(root, ['count', 'total', 'nodes']);
    if (n != null) return { up: n, total: n };
  }
  return { up, total };
}
