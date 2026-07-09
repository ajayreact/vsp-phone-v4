import { NextResponse } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const SERVICE_TOKEN = process.env.TELECOM_SERVICE_AUTH_TOKEN || '';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!SERVICE_TOKEN) {
    return NextResponse.json(
      { error: 'TELECOM_SERVICE_AUTH_TOKEN not configured on admin server' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${API_BASE}/v1/production/readiness`, {
      headers: {
        'X-VSP-Service-Auth': SERVICE_TOKEN,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
    return NextResponse.json(JSON.parse(text));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'BFF proxy failed' },
      { status: 502 },
    );
  }
}
