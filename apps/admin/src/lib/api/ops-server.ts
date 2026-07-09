const API_BASE = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const SERVICE_TOKEN = process.env.TELECOM_SERVICE_AUTH_TOKEN || '';

async function bffFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'X-VSP-Service-Auth': SERVICE_TOKEN,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `BFF upstream ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type InfraHealthCheck = {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  message?: string;
};

export type OpsDashboardSnapshot = {
  ts: string;
  tenantId: string;
  activeCalls: number;
  registeredDevices: number;
  activeConferences: number;
  activeQueues: number;
  onlineTenants: number;
  redis: { available: boolean };
  postgres: { connected: boolean };
  infrastructure: {
    api: InfraHealthCheck;
    postgres: InfraHealthCheck;
    redis: InfraHealthCheck;
    kamailio: InfraHealthCheck;
    rtpengine: InfraHealthCheck;
    telnyx: InfraHealthCheck;
  };
};

export type HealthDetail = OpsDashboardSnapshot['infrastructure'];

export async function fetchOpsDashboard(tenantId?: string): Promise<OpsDashboardSnapshot> {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return bffFetch(`/v1/observability/dashboard${q}`);
}

export async function fetchHealthDetail(): Promise<HealthDetail> {
  return bffFetch('/v1/observability/health/detail');
}

export { API_BASE, SERVICE_TOKEN };
