/**
 * Runtime verification for tenant onboarding + number marketplace digit filters.
 * Usage: node scripts/platform/verify-onboarding-runtime.cjs [--api-base URL] [--token JWT]
 */

function normalizePhoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function phoneMatchesDigitFilters(phoneNumber, filters) {
  const digits = normalizePhoneDigits(phoneNumber);
  const contains = normalizePhoneDigits(filters.contains);
  const endsWith = normalizePhoneDigits(filters.endsWith);
  const startsWith = normalizePhoneDigits(filters.startsWith);
  if (contains && !digits.includes(contains)) return false;
  if (endsWith && !digits.endsWith(endsWith)) return false;
  if (startsWith && !digits.startsWith(startsWith)) return false;
  return true;
}

function assert(name, ok, detail = '') {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${name}`);
}

assert('Contains=9 matches +14155550199', phoneMatchesDigitFilters('+1 (415) 555-0199', { contains: '9' }));
assert('Contains=9 rejects +14155550100', !phoneMatchesDigitFilters('+1 (415) 555-0100', { contains: '9' }));
assert('EndsWith=589 matches', phoneMatchesDigitFilters('+1-212-555-4589', { endsWith: '589' }));
assert('EndsWith=589 rejects', !phoneMatchesDigitFilters('+1-212-555-4580', { endsWith: '589' }));

async function apiGet(base, path, token) {
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  const args = process.argv.slice(2);
  const apiBase = args.includes('--api-base')
    ? args[args.indexOf('--api-base') + 1]
    : process.env.API_BASE || 'https://api.vspphone.com/api';
  const token = args.includes('--token') ? args[args.indexOf('--token') + 1] : process.env.PLATFORM_JWT;

  const health = await apiGet(apiBase, '/health', null);
  assert('API health 200', health.status === 200, String(health.status));

  if (!token) {
    console.log('SKIP: authenticated platform checks (set PLATFORM_JWT or --token)');
    return;
  }

  const plansRes = await apiGet(apiBase, '/v1/platform/billing/plans', token);
  assert('plans API 200', plansRes.status === 200, String(plansRes.status));
  const plans = Array.isArray(plansRes.body?.data) ? plansRes.body.data : [];
  for (const required of ['Starter', 'Business', 'Professional', 'Enterprise']) {
    assert(`plan seeded: ${required}`, plans.some((p) => p.name === required), plans.map((p) => p.name).join(', '));
  }

  const tenantsRes = await apiGet(apiBase, '/v1/platform/tenants', token);
  assert('tenants API 200', tenantsRes.status === 200, String(tenantsRes.status));
  const tenants = Array.isArray(tenantsRes.body?.data) ? tenantsRes.body.data : [];

  if (tenants[0]?.id) {
    const orgRes = await apiGet(apiBase, `/v1/platform/organization/${tenants[0].id}`, token);
    assert('organization API 200', orgRes.status === 200, String(orgRes.status));
  }

  const subsRes = await apiGet(apiBase, '/v1/platform/billing/subscriptions', token);
  assert('subscriptions API 200', subsRes.status === 200, String(subsRes.status));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
