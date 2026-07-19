import type { InfraHealthCheck } from '../../types/telecom';

export type PlatformHealthCard = {
  id: string;
  name: string;
  status: string;
  tone: 'online' | 'warning' | 'offline';
  detail: string;
  latencyMs: number | null;
  numeric?: number | null;
};

const ORDER: Array<{ id: string; name: string; aliases?: string[] }> = [
  { id: 'api', name: 'API' },
  { id: 'kamailio', name: 'Kamailio' },
  { id: 'rtpengine', name: 'RTPengine' },
  { id: 'redis', name: 'Redis' },
  { id: 'database', name: 'PostgreSQL', aliases: ['postgres'] },
  { id: 'carrier', name: 'Carrier', aliases: ['telnyx'] },
  { id: 'provisioning', name: 'Provisioning' },
  { id: 'ssl', name: 'SSL' },
  { id: 'docker', name: 'Docker' },
  { id: 'disk', name: 'Disk' },
  { id: 'memory', name: 'Memory' },
  { id: 'cpu', name: 'CPU' },
  { id: 'version', name: 'Version' },
  { id: 'uptime', name: 'Uptime' },
  { id: 'nginx', name: 'Nginx' },
];

function toneOf(status: string): PlatformHealthCard['tone'] {
  if (status === 'up') return 'online';
  if (status === 'degraded') return 'warning';
  return 'offline';
}

function parsePct(message?: string): number | null {
  if (!message) return null;
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(message);
  return m ? Number(m[1]) : null;
}

function parseLoad(message?: string): number | null {
  if (!message) return null;
  const m = /load\s+(\d+(?:\.\d+)?)/i.exec(message);
  return m ? Number(m[1]) : null;
}

export function normalizePlatformHealth(
  components: Record<string, InfraHealthCheck | undefined> | null | undefined,
): PlatformHealthCard[] {
  if (!components) return [];
  const seen = new Set<string>();
  const cards: PlatformHealthCard[] = [];

  for (const def of ORDER) {
    const check =
      components[def.id] ??
      (def.aliases?.map((a) => components[a]).find(Boolean) as InfraHealthCheck | undefined);
    if (!check) continue;
    if (def.id === 'postgres' && components.database) continue;
    if (def.id === 'telnyx' && components.carrier) continue;
    if (seen.has(def.name)) continue;
    seen.add(def.name);

    const detail =
      check.message ||
      check.version ||
      check.failureReason ||
      (check.latencyMs != null ? `${check.latencyMs}ms` : '—');

    let numeric: number | null = check.latencyMs ?? null;
    if (def.id === 'memory' || def.id === 'disk') numeric = parsePct(check.message);
    if (def.id === 'cpu') numeric = parseLoad(check.message) ?? parsePct(check.message);

    cards.push({
      id: def.id,
      name: def.name,
      status: check.status,
      tone: toneOf(check.status),
      detail,
      latencyMs: check.latencyMs ?? null,
      numeric,
    });
  }

  return cards;
}

export function healthLatencySample(cards: PlatformHealthCard[]): number | null {
  const withLatency = cards.filter((c) => c.latencyMs != null).map((c) => c.latencyMs!) ;
  if (!withLatency.length) return null;
  return Math.round(withLatency.reduce((a, b) => a + b, 0) / withLatency.length);
}

export function cardNumeric(cards: PlatformHealthCard[], id: string): number | null {
  const card = cards.find((c) => c.id === id);
  return card?.numeric ?? card?.latencyMs ?? null;
}
