import { NextResponse } from 'next/server';
import {
  BFF_OBSERVABILITY_READ_PERMISSIONS,
  requireBffAuth,
  resolveBffTenantId,
} from '../../../../../lib/bff/bff-auth';
import { fetchOpsDashboard, SERVICE_TOKEN } from '../../../../../lib/api/ops-server';

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
    const tenantId = resolveBffTenantId(auth.session);
    const data = await fetchOpsDashboard(tenantId);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'BFF proxy failed' },
      { status: 502 },
    );
  }
}
