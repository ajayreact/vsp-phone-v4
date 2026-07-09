import { NextResponse } from 'next/server';
import { fetchOpsDashboard, SERVICE_TOKEN } from '../../../../../lib/api/ops-server';

export const dynamic = 'force-dynamic';

/** Proxies live call diagnostics for NOC view. */
export async function GET(request: Request) {
  if (!SERVICE_TOKEN) {
    return NextResponse.json(
      { error: 'TELECOM_SERVICE_AUTH_TOKEN not configured on admin server' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ data: [] });
  }

  const API_BASE =
    process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

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
