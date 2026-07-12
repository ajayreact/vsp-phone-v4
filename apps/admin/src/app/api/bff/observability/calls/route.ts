import { NextResponse } from 'next/server';
import {
  BFF_OBSERVABILITY_CALLS_PERMISSIONS,
  requireBffAuth,
  resolveBffTenantId,
} from '../../../../../lib/bff/bff-auth';
import { API_BASE, SERVICE_TOKEN } from '../../../../../lib/api/ops-server';

export const dynamic = 'force-dynamic';

/** Proxies live call diagnostics for NOC view — tenant scoped from JWT only. */
export async function GET(request: Request) {
  if (!SERVICE_TOKEN) {
    return NextResponse.json(
      { error: 'TELECOM_SERVICE_AUTH_TOKEN not configured on admin server' },
      { status: 503 },
    );
  }

  const auth = await requireBffAuth(request, BFF_OBSERVABILITY_CALLS_PERMISSIONS);
  if ('response' in auth) return auth.response;

  const tenantId = resolveBffTenantId(auth.session);

  try {
    const res = await fetch(
      `${API_BASE}/v1/observability/diagnostics/calls?tenantId=${encodeURIComponent(tenantId)}&limit=50`,
      {
        headers: {
          'X-VSP-Service-Auth': SERVICE_TOKEN,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }

    const payload = await res.json();
    const rows = Array.isArray(payload) ? payload : payload.data ?? payload.items ?? [];
    const data = rows.map((row: Record<string, unknown>, index: number) => ({
      id: String(row.id ?? row.platformUuid ?? index),
      platformUuid: String(row.platformUuid ?? row.id ?? ''),
      caller: String(row.from ?? row.caller ?? row.callerNumber ?? '—'),
      callee: String(row.to ?? row.callee ?? row.extension ?? '—'),
      tenantId,
      tenantName: String(row.tenantName ?? '—'),
      trunk: String(row.trunk ?? row.carrier ?? '—'),
      codec: String(row.codec ?? '—'),
      mos: typeof row.mos === 'number' ? row.mos : null,
      jitterMs: typeof row.jitterMs === 'number' ? row.jitterMs : null,
      packetLossPct: typeof row.packetLossPct === 'number' ? row.packetLossPct : null,
      durationSec: Number(row.durationSec ?? row.duration ?? 0),
      recording: Boolean(row.recording),
      status: String(row.state ?? row.status ?? 'unknown'),
      direction: String(row.direction ?? '—'),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'BFF proxy failed' },
      { status: 502 },
    );
  }
}
