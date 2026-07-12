import { NextResponse } from 'next/server';
import { BFF_OBSERVABILITY_READ_PERMISSIONS, requireBffAuth } from '../../../../../lib/bff/bff-auth';
import { fetchHealthDetail, SERVICE_TOKEN } from '../../../../../lib/api/ops-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!SERVICE_TOKEN) {
    return NextResponse.json(
      { error: 'TELECOM_SERVICE_AUTH_TOKEN not configured on admin server' },
      { status: 503 },
    );
  }

  const auth = await requireBffAuth(request, BFF_OBSERVABILITY_READ_PERMISSIONS);
  if ('response' in auth) return auth.response;

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
