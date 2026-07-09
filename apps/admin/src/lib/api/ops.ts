import type { OpsDashboardSnapshot } from './ops-server';

/** Client-side ops API — uses admin BFF routes with graceful fallback. */

export type OpsKpis = {
  activeCalls: number;
  registeredDevices: number;
  activeQueues: number;
  onlineTenants: number;
  telnyxStatus: 'up' | 'down' | 'degraded' | 'unknown';
  source: 'live' | 'mock';
};

const FALLBACK_KPIS: OpsKpis = {
  activeCalls: 0,
  registeredDevices: 0,
  activeQueues: 0,
  onlineTenants: 0,
  telnyxStatus: 'unknown',
  source: 'mock',
};

function mapSnapshot(snapshot: OpsDashboardSnapshot): OpsKpis {
  const telnyx = snapshot.infrastructure?.telnyx?.status ?? 'unknown';
  return {
    activeCalls: snapshot.activeCalls ?? 0,
    registeredDevices: snapshot.registeredDevices ?? 0,
    activeQueues: snapshot.activeQueues ?? 0,
    onlineTenants: snapshot.onlineTenants ?? 0,
    telnyxStatus: telnyx === 'up' ? 'up' : telnyx === 'degraded' ? 'degraded' : telnyx === 'down' ? 'down' : 'unknown',
    source: 'live',
  };
}

export async function fetchOpsKpis(tenantId?: string): Promise<OpsKpis> {
  try {
    const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const res = await fetch(`/api/bff/observability/dashboard${q}`, { cache: 'no-store' });
    if (!res.ok) return FALLBACK_KPIS;
    const data = (await res.json()) as OpsDashboardSnapshot;
    return mapSnapshot(data);
  } catch {
    return FALLBACK_KPIS;
  }
}

export async function fetchInfraHealth(): Promise<OpsDashboardSnapshot['infrastructure'] | null> {
  try {
    const res = await fetch('/api/bff/observability/health', { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
