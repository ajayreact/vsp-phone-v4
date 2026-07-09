import { NextResponse } from 'next/server';
import { fetchHealthDetail, SERVICE_TOKEN } from '../../../../../lib/api/ops-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!SERVICE_TOKEN) {
    return NextResponse.json(
      { error: 'TELECOM_SERVICE_AUTH_TOKEN not configured on admin server' },
      { status: 503 },
    );
  }

  try {
    const data = await fetchHealthDetail();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'BFF proxy failed' },
      { status: 502 },
    );
  }
}
