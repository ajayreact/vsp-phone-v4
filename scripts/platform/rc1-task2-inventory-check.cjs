const API_BASE = process.env.API_BASE || 'https://api.vspphone.com/api';
const EMAIL = process.env.PLATFORM_EMAIL;
const PASSWORD = process.env.PLATFORM_PASSWORD;

async function login() {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`login failed: ${res.status} ${JSON.stringify(json)}`);
  return json.accessToken;
}

async function get(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  const token = await login();
  console.log('Login OK');

  const dashboard = await get('/v1/carriers/telnyx/numbers/dashboard', token);
  console.log('Dashboard:', JSON.stringify(dashboard.json, null, 2));

  const all = await get('/v1/carriers/telnyx/numbers?limit=200', token);
  const rows = all.json?.data ?? all.json ?? [];
  console.log(`Total numbers returned: ${Array.isArray(rows) ? rows.length : 'n/a'}`);
  if (Array.isArray(rows)) {
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    console.log('By status:', byStatus);
    const available = rows.filter((r) => r.status === 'available' || r.status === 'AVAILABLE');
    console.log(`Available count: ${available.length}`);
    console.log('Available numbers:', available.map((r) => ({ id: r.id, number: r.number })));
  }

  const tenants = await get('/v1/platform/tenants', token);
  const tRows = tenants.json?.data ?? tenants.json ?? [];
  console.log(`\nTenants (${Array.isArray(tRows) ? tRows.length : 'n/a'}):`);
  if (Array.isArray(tRows)) {
    for (const t of tRows) console.log(`  ${t.id}  ${t.slug}  ${t.status}`);
  }
})().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
