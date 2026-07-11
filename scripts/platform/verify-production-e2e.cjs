#!/usr/bin/env node
'use strict';

/**
 * Production E2E verification — run on EC2 after deploy (or locally with API_BASE + credentials).
 *
 *   API_BASE=https://api.vspphone.com/api \
 *   PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
 *   node scripts/platform/verify-production-e2e.cjs
 *
 * Optional: TENANT_SLUG after onboard to verify tenant portal login.
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const API_BASE = (process.env.API_BASE || 'https://api.vspphone.com/api').replace(/\/$/, '');
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';

const PLATFORM_MENUS = [
  { label: 'Dashboard', path: '/v1/platform/dashboard' },
  { label: 'Tenants', path: '/v1/platform/tenants' },
  { label: 'Organization', path: null },
  { label: 'Users', path: '/v1/platform/users' },
  { label: 'Roles', path: '/v1/platform/roles' },
  { label: 'Permissions', path: '/v1/platform/permissions' },
  { label: 'API Keys', path: '/v1/platform/api-keys' },
  { label: 'Settings', path: '/v1/platform/settings' },
  { label: 'Telnyx Numbers', path: '/v1/carriers/telnyx/numbers/dashboard' },
  { label: 'Number Marketplace', path: '/v1/carriers/telnyx/numbers/search/available?countryCode=US&limit=5&contains=9' },
  { label: 'Number Requests', path: '/v1/carriers/telnyx/numbers/requests' },
  { label: 'Carrier Integrations', path: '/v1/platform/carriers' },
  { label: 'SIP Trunks', path: '/v1/carriers/trunks' },
  { label: 'Billing Dashboard', path: '/v1/platform/billing/summary' },
  { label: 'Audit Logs', path: '/v1/platform/audit' },
  { label: 'Marketplace Reports', path: '/v1/carriers/telnyx/numbers/reports/marketplace' },
  { label: 'System Health', path: '/v1/ops/health' },
];

const results = [];

function record(section, step, pass, detail = '') {
  results.push({ section, step, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${section} — ${step}${detail ? ` (${detail})` : ''}`);
}

async function api(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !formData) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, ok: res.ok };
}

function unwrap(res) {
  return res.json?.data ?? res.json;
}

async function main() {
  console.log(`\n=== VSP Phone Production E2E ===\nAPI: ${API_BASE}\n`);

  // --- 1. Platform Admin ---
  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    record('Platform Admin', 'Login', false, 'Set PLATFORM_EMAIL and PLATFORM_PASSWORD');
    printReport();
    process.exit(1);
  }

  const login = await api('POST', '/v1/auth/login', {
    body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD },
  });
  record('Platform Admin', 'Login succeeds', login.ok && unwrap(login)?.accessToken, `HTTP ${login.status}`);

  const token = unwrap(login)?.accessToken;
  if (!token) {
    printReport();
    process.exit(1);
  }

  const me = await api('GET', '/v1/auth/me', { token });
  record('Platform Admin', 'JWT issued /auth/me', me.ok, `user=${unwrap(me)?.email ?? '?'}`);

  let tenantIdForOrg = null;
  for (const menu of PLATFORM_MENUS) {
    if (!menu.path) continue;
    const res = await api('GET', menu.path, { token });
    record('Platform Admin', `Menu API: ${menu.label}`, res.ok, `HTTP ${res.status}`);
    if (menu.label === 'Tenants' && res.ok) {
      const tenants = unwrap(res);
      if (Array.isArray(tenants) && tenants[0]) tenantIdForOrg = tenants[0].id;
    }
  }

  if (tenantIdForOrg) {
    const org = await api('GET', `/v1/platform/organization/${tenantIdForOrg}`, { token });
    record('Platform Admin', 'Organization page API', org.ok, `HTTP ${org.status}`);
  } else {
    record('Platform Admin', 'Organization page API', false, 'No tenant for org lookup');
  }

  const adminPages = [
    'https://admin.vspphone.com/dashboard',
    'https://admin.vspphone.com/tenants',
    'https://admin.vspphone.com/organization',
    'https://admin.vspphone.com/number-marketplace',
  ];
  for (const url of adminPages) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      record('Platform Admin', `Admin page ${url.replace('https://admin.vspphone.com', '')}`, res.status === 200, `HTTP ${res.status}`);
    } catch (err) {
      record('Platform Admin', `Admin page ${url}`, false, err.message);
    }
  }

  // --- 2. Number Marketplace ---
  const contains = await api('GET', '/v1/carriers/telnyx/numbers/search/available?countryCode=US&limit=20&contains=9', { token });
  const containsData = unwrap(contains);
  const containsList = Array.isArray(containsData) ? containsData : containsData?.numbers ?? containsData?.items ?? [];
  const containsOk =
    contains.ok &&
    (containsList.length === 0 ||
      containsList.every((n) => String(n.phoneNumber || n.number || '').replace(/\D/g, '').includes('9')));
  record('Number Marketplace', 'Contains=9', containsOk, `count=${containsList.length}`);

  const endsWith = await api('GET', '/v1/carriers/telnyx/numbers/search/available?countryCode=US&limit=20&endsWith=589', { token });
  const endsData = unwrap(endsWith);
  const endsList = Array.isArray(endsData) ? endsData : endsData?.numbers ?? endsData?.items ?? [];
  const endsOk =
    endsWith.ok &&
    (endsList.length === 0 ||
      endsList.every((n) => String(n.phoneNumber || n.number || '').replace(/\D/g, '').endsWith('589')));
  record('Number Marketplace', 'EndsWith=589', endsOk, `count=${endsList.length}`);

  const requests = await api('GET', '/v1/carriers/telnyx/numbers/requests', { token });
  record('Number Marketplace', 'Number Requests API', requests.ok, `HTTP ${requests.status}`);

  const reports = await api('GET', '/v1/carriers/telnyx/numbers/reports/marketplace', { token });
  record('Number Marketplace', 'Marketplace Reports API', reports.ok, `HTTP ${reports.status}`);

  record(
    'Number Marketplace',
    'Purchase flow',
    true,
    'SKIP — manual Telnyx purchase not auto-tested',
  );

  // --- 3. Tenant Onboarding ---
  const slug = `verify-${Date.now().toString(36)}`;
  const adminEmail = `admin+${slug}@verify.vspphone.com`;
  const adminPassword = `Verify!${randomUUID().slice(0, 8)}`;

  const plansRes = await api('GET', '/v1/platform/billing/plans', { token });
  const plans = unwrap(plansRes) || [];
  const plan = plans.find((p) => p.name === 'Starter') || plans[0];
  record('Tenant Onboarding', 'Plans dropdown not empty', plans.length >= 4, `plans=${plans.map((p) => p.name).join(', ')}`);

  if (!plan) {
    record('Tenant Onboarding', 'Onboard tenant', false, 'No plan available');
    printReport();
    process.exit(1);
  }

  // Logo upload (curl — Node FormData varies by version)
  let logo = null;
  let logoStatus = 0;
  try {
    const tmpLogo = path.join(require('node:os').tmpdir(), `logo-${Date.now()}.png`);
    fs.writeFileSync(
      tmpLogo,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const { execSync } = require('node:child_process');
    const raw = execSync(
      `curl -sk -w "\\n%{http_code}" -H "Authorization: Bearer ${token}" -F "file=@${tmpLogo};type=image/png" "${API_BASE}/v1/platform/tenants/logo-upload"`,
      { encoding: 'utf8' },
    );
    const lines = raw.trim().split('\n');
    logoStatus = Number(lines.pop());
    const body = lines.join('\n');
    try {
      logo = JSON.parse(body)?.data ?? JSON.parse(body);
    } catch {
      logo = null;
    }
    fs.unlinkSync(tmpLogo);
  } catch (err) {
    record('Tenant Onboarding', 'Logo uploads', false, err.message);
  }
  if (logoStatus) {
    record('Tenant Onboarding', 'Logo uploads', logoStatus >= 200 && logoStatus < 300 && logo?.logoUrl, `HTTP ${logoStatus}`);
  }

  const onboardPayload = {
    name: `Verify Org ${slug}`,
    displayName: `Verify Org ${slug}`,
    slug,
    businessEmail: `biz+${slug}@verify.vspphone.com`,
    businessPhone: '+1-415-555-0100',
    website: 'https://verify.example.com',
    industry: 'Technology',
    companySize: '11-50',
    logoUrl: logo?.logoUrl,
    timezone: 'America/New_York',
    country: 'US',
    state: 'CA',
    city: 'San Francisco',
    address: '100 Verify St',
    postalCode: '94105',
    currency: 'USD',
    defaultLanguage: 'en',
    status: 'ACTIVE',
    siteName: 'Verify HQ',
    siteCountry: 'US',
    siteTimezone: 'America/New_York',
    siteAddress: '100 Verify St',
    siteLocationCode: 'HQ-VERIFY',
    siteDescription: 'Verification site',
    businessHours: 'Mon-Fri 9:00-17:00',
    adminEmail,
    adminPassword,
    adminFirstName: 'Verify',
    adminLastName: 'Admin',
    adminUsername: `admin_${slug}`,
    adminMobile: '+1-415-555-0199',
    adminJobTitle: 'IT Director',
    adminDepartment: 'Engineering',
    adminLanguage: 'en',
    adminTimezone: 'America/New_York',
    voicemailEnabled: true,
    recordingEnabled: false,
    musicOnHold: true,
    planId: plan.id,
    trial: true,
    billingCycle: 'monthly',
    maxExtensions: 20,
    maxUsers: 10,
    maxNumbers: 5,
    storageLimitGb: 25,
    recordingRetentionDays: 30,
  };

  const onboard = await api('POST', '/v1/platform/tenants/onboard', { token, body: onboardPayload });
  const onboardData = unwrap(onboard);
  record('Tenant Onboarding', 'Tenant created', onboard.ok && onboardData?.tenant?.id, `HTTP ${onboard.status}`);

  const newTenantId = onboardData?.tenant?.id;
  const newSiteId = onboardData?.siteId;
  const newAdminId = onboardData?.adminUserId;
  const newSubId = onboardData?.subscriptionId;

  record('Tenant Onboarding', 'Subscription created', Boolean(newSubId));
  record('Tenant Onboarding', 'Site ID returned', Boolean(newSiteId));
  record('Tenant Onboarding', 'Admin user ID returned', Boolean(newAdminId));

  // --- 4. Tenant Portal ---
  const tenantLogin = await api('POST', '/v1/auth/login', {
    body: { email: adminEmail, password: adminPassword },
  });
  const tenantToken = unwrap(tenantLogin)?.accessToken;
  record('Tenant Portal', 'Authentication works', tenantLogin.ok && tenantToken, `HTTP ${tenantLogin.status}`);
  record('Tenant Portal', 'JWT issued', Boolean(tenantToken));

  if (tenantToken) {
    const tenantMe = await api('GET', '/v1/auth/me', { token: tenantToken });
    record('Tenant Portal', 'Dashboard /auth/me loads', tenantMe.ok);
    record(
      'Tenant Portal',
      'Tenant isolation',
      unwrap(tenantMe)?.tenantId === newTenantId,
      `tenantId=${unwrap(tenantMe)?.tenantId}`,
    );
  }

  try {
    const tenantUrl = 'https://tenant.vspphone.com/login';
    const tenantPage = await fetch(tenantUrl, { redirect: 'follow' });
    record('Tenant Portal', 'Portal tenant.vspphone.com/login', tenantPage.status === 200, `HTTP ${tenantPage.status}`);
  } catch (err) {
    record('Tenant Portal', 'Portal tenant.vspphone.com/login', false, err.message);
  }

  // --- 5. Database verification (via docker on EC2) ---
  if (newTenantId) {
    const auditRes = await api('GET', `/v1/platform/audit?tenantId=${newTenantId}&limit=20`, { token });
    const auditRows = unwrap(auditRes);
    const hasOnboard = Array.isArray(auditRows) && auditRows.some((r) => r.action === 'tenant.onboarded');
    record('Database', 'Audit log tenant.onboarded', auditRes.ok && hasOnboard, `HTTP ${auditRes.status}`);
    await runDbVerify(newTenantId, logo?.logoUrl);
  } else {
    record('Database', 'Postgres field persistence', false, 'No tenant ID from onboard');
  }

  printReport();
  const failed = results.filter((r) => !r.pass && !(r.detail || '').startsWith('SKIP')).length;
  process.exit(failed > 0 ? 1 : 0);
}

async function runDbVerify(tenantId, logoUrl) {
  const { execSync } = require('node:child_process');
  const repoRoot = process.env.REPO_ROOT || '/opt/vsp-phone-v4';
  const dbName = process.env.POSTGRES_DB || 'vsp_phone_v4';
  const compose =
    process.env.COMPOSE ||
    'docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env';
  try {
    const checks = [
      ['tenant_settings.business_email', `SELECT CASE WHEN business_email IS NOT NULL THEN 'OK' ELSE 'MISSING' END FROM tenant_settings WHERE tenant_id='${tenantId}'`],
      ['tenant_settings.logo_url', logoUrl ? `SELECT CASE WHEN logo_url IS NOT NULL THEN 'OK' ELSE 'MISSING' END FROM tenant_settings WHERE tenant_id='${tenantId}'` : null],
      ['sites.postal_code', `SELECT CASE WHEN postal_code IS NOT NULL THEN 'OK' ELSE 'MISSING' END FROM sites WHERE tenant_id='${tenantId}' AND deleted_at IS NULL LIMIT 1`],
      ['user_profiles.mobile', `SELECT CASE WHEN mobile IS NOT NULL THEN 'OK' ELSE 'MISSING' END FROM user_profiles WHERE tenant_id='${tenantId}' AND deleted_at IS NULL LIMIT 1`],
      ['subscriptions.billing_cycle', `SELECT CASE WHEN billing_cycle IS NOT NULL THEN 'OK' ELSE 'MISSING' END FROM subscriptions WHERE tenant_id='${tenantId}'`],
      ['billing_accounts', `SELECT CASE WHEN COUNT(*)=1 THEN 'OK' ELSE 'MISSING' END FROM billing_accounts WHERE tenant_id='${tenantId}'`],
      ['tenant_features', `SELECT CASE WHEN COUNT(*)>=3 THEN 'OK' ELSE 'MISSING' END FROM tenant_features WHERE tenant_id='${tenantId}' AND deleted_at IS NULL`],
    ].filter(([, sql]) => sql);

    for (const [label, sql] of checks) {
      const out = execSync(`${compose} exec -T postgres psql -U vsp -d ${dbName} -t -A -c "${sql}"`, {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
      record('Database', label, out === 'OK', out || 'empty');
    }
  } catch (err) {
    record('Database', 'Postgres checks', false, err.message);
  }
}

function printReport() {
  console.log('\n=== SUMMARY ===');
  const sections = [...new Set(results.map((r) => r.section))];
  for (const section of sections) {
    console.log(`\n## ${section}`);
    for (const r of results.filter((x) => x.section === section)) {
      const skip = (r.detail || '').startsWith('SKIP');
      const tag = r.pass ? (skip ? 'SKIP' : 'PASS') : 'FAIL';
      console.log(`  ${tag}  ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`\nTotal: ${pass} PASS / ${fail} FAIL\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
