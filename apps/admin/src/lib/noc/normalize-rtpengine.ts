import {
  asArray,
  asRecord,
  displayOrDash,
  formatLatency,
  pickNumber,
  pickString,
} from './payload';

export type RtpengineViewModel = {
  status: string;
  host: string;
  latency: string;
  sessionCount: number;
  srtpSessions: number;
  transcoding: number;
  nodeCount: number;
  nodesUp: number;
  ports: string;
  avgMos: string;
  avgPacketLoss: string;
  avgJitter: string;
  mediaErrors: string;
  cpu: string;
  health: string;
  healthTone: 'online' | 'warning' | 'offline';
  ngError: string | null;
  sessionRows: Array<{
    id: string;
    platformUuid: string;
    mos: string;
    packetLoss: string;
    jitter: string;
    codec: string;
    quality: string;
  }>;
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function normalizeRtpengineDashboard(
  data: Record<string, unknown> | null | undefined,
): RtpengineViewModel {
  const nodes = asArray(data?.nodes).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const primary = nodes[0] ?? null;
  const nodesUp = nodes.filter((n) => String(n.status ?? '').toLowerCase() === 'up').length;
  const ping = asRecord(data?.ping);
  const pingOk = ping?.ok === true || pickString(ping, ['status']) === 'up';
  const latencyMs =
    pickNumber(primary, ['latencyMs', 'latency']) ?? pickNumber(ping, ['latencyMs', 'latency']);
  const host = primary
    ? `${pickString(primary, ['host', 'id']) ?? 'rtpengine'}${
        pickNumber(primary, ['port']) != null ? `:${pickNumber(primary, ['port'])}` : ''
      }`
    : '—';

  const sessions = asArray(data?.activeSessions);
  const sessionCount = pickNumber(data, ['sessionCount']) ?? sessions.length;
  const srtpSessions = pickNumber(data, ['srtpSessions']) ?? 0;
  const transcoding = pickNumber(data, ['transcoding']) ?? 0;
  const ngError = pickString(data, ['ngError']) ?? null;
  const ports = asArray(data?.ports).length || sessionCount;

  const mosVals: number[] = [];
  const lossVals: number[] = [];
  const jitterVals: number[] = [];
  let mediaErrors = 0;

  const sessionRows = sessions.slice(0, 50).map((raw, i) => {
    const s = asRecord(raw) ?? {};
    const mos = pickNumber(s, ['mos']);
    const loss = pickNumber(s, ['packetLossPct', 'packet_loss']);
    const jitter = pickNumber(s, ['jitterMs', 'jitter']);
    if (mos != null) mosVals.push(mos);
    if (loss != null) lossVals.push(loss);
    if (jitter != null) jitterVals.push(jitter);
    const quality = pickString(s, ['rtpQuality', 'quality']) ?? 'unknown';
    if (quality === 'fair' || quality === 'poor' || (mos != null && mos < 3.5)) mediaErrors += 1;
    return {
      id: pickString(s, ['platformUuid', 'callSessionId', 'rtpSessionId']) ?? `session-${i}`,
      platformUuid: String(pickString(s, ['platformUuid']) ?? '—').slice(0, 18),
      mos: mos != null ? mos.toFixed(2) : '—',
      packetLoss: loss != null ? `${loss}%` : '—',
      jitter: jitter != null ? `${jitter} ms` : '—',
      codec: pickString(s, ['codec']) ?? '—',
      quality,
    };
  });

  const avgMos = avg(mosVals);
  const avgLoss = avg(lossVals);
  const avgJitter = avg(jitterVals);

  let health = 'unknown';
  let healthTone: RtpengineViewModel['healthTone'] = 'warning';
  if (ngError) {
    health = 'ng error';
    healthTone = 'offline';
  } else if (nodes.length > 0 && nodesUp === 0) {
    health = 'down';
    healthTone = 'offline';
  } else if (nodes.length > 0 && nodesUp < nodes.length) {
    health = 'degraded';
    healthTone = 'warning';
  } else if (pingOk || nodesUp > 0) {
    health = 'healthy';
    healthTone = 'online';
  }

  return {
    status: displayOrDash(pickString(primary, ['status']) ?? (pingOk ? 'up' : 'unknown')),
    host,
    latency: formatLatency(latencyMs),
    sessionCount,
    srtpSessions,
    transcoding,
    nodeCount: nodes.length,
    nodesUp,
    ports: String(ports),
    avgMos: avgMos != null ? avgMos.toFixed(2) : '—',
    avgPacketLoss: avgLoss != null ? `${avgLoss.toFixed(1)}%` : '—',
    avgJitter: avgJitter != null ? `${avgJitter.toFixed(1)} ms` : '—',
    mediaErrors: String(mediaErrors),
    cpu: displayOrDash(pickString(data, ['cpu']) ?? pickNumber(data, ['cpuPct'])),
    health,
    healthTone,
    ngError,
    sessionRows,
  };
}
