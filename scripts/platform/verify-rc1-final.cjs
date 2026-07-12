#!/usr/bin/env node
'use strict';

/**
 * RC1 Final Verification — comprehensive API + BFF checks.
 * Writes static/runtime-verification/rc1-final-report.json
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(/\/$/, '');
const ADMIN_BASE = (process.env.ADMIN_BASE || 'http://localhost:3001').replace(/\/$/, '');

const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';

const signoffPath = path.join(process.cwd(), 'static/runtime-verification/2b-signoff-env.json');
let signoff = {};
try {
  signoff = JSON.parse(fs.readFileSync(signoffPath, 'utf8'));
} catch {
  /* optional */
}

const TENANT_EMAIL = process.env.TENANT_EMAIL || process.env.E2E_TENANT_EMAIL || signoff.email || '';
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || process.env.E2E_TENANT_PASSWORD || signoff.password || '';

const OUT = path.join(process.cwd(), 'static/runtime-verification/rc1-final-report.json');
const results = [];
const perf = [];

function record(section, step, pass, detail = '', ms = null) {
  results.push({ section, step, pass, detail, ms });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${section} — ${step}${detail ? ` — ${detail}` : ''}${ms != null ? ` (${ms}ms)` : ''}`);
}

async function login(email, password) {
  const started = Date.now();
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const ms = Date.now() - started;
  const json = await res.json().catch(() => ({}));
  perf.push({ op: 'login', email: email.split('@')[0] + '@…', ms, status: res.status });
  return { status: res.status, token: json.accessToken || null, ms, json };
}

async function api(method, urlPath, token) {
  const started = Date.now();
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const ms = Date.now() - started;
  perf.push({ op: `${method} ${urlPath}`, ms, status: res.status });
  return { status: res.status, ok: res.ok, ms };
}

async function bffGet(route, token) {
  const started = Date.now();
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${ADMIN_BASE}${route}`, { headers, cache: 'no-store' });
  const ms = Date.now() - started;
  perf.push({ op: `BFF ${route}`, ms, status: res.status });
  return { status: res.status, ms };
}

const BFF_ROUTES = [
  '/api/bff/observability/health',
  '/api/bff/observability/dashboard',
  '/api/bff/observability/calls',
  '/api/bff/readiness',
];

(async () => {
  console.log('\n=== RC1 Final Verification ===');
  console.log('API:', API_BASE);
  console.log('Admin:', ADMIN_BASE);

  // Environment audit
  const devAuth = ['DEV_AUTH_EMAIL', 'DEV_AUTH_PASSWORD', 'DEV_AUTH_USER_ID', 'DEV_AUTH_TENANT_ID'].filter(
    (k) => process.env[k],
  );
  record('env', 'DEV_AUTH_* absent', devAuth.length === 0, devAuth.join(', ') || 'none');
  record('env', 'SWAGGER_ENABLED=false', process.env.SWAGGER_ENABLED === 'false' || !process.env.SWAGGER_ENABLED);
  record('env', 'JWT_SECRET set', Boolean(process.env.JWT_SECRET));
  record('env', 'TELECOM_SERVICE_AUTH_TOKEN set', Boolean(process.env.TELECOM_SERVICE_AUTH_TOKEN));
  record('env', 'DATABASE_URL set', Boolean(process.env.DATABASE_URL));
  record('env', 'HTTPS API URL', API_BASE.startsWith('https://'));

  const health = await fetch(`${API_BASE}/health`);
  const healthJson = await health.json().catch(() => ({}));
  record('env', 'API health OK', health.ok, healthJson.status, null);
  record('env', 'Redis up', healthJson.checks?.redis?.status === 'up' || healthJson.status === 'ok', '');

  const ready = await fetch(`${API_BASE}/ready`);
  record('env', 'API ready OK', ready.ok, `status ${ready.status}`);

  // BFF security — anonymous
  for (const route of BFF_ROUTES) {
    const r = await bffGet(route, null);
    record('bff', `${route} anonymous → 401`, r.status === 401, `got ${r.status}`, r.ms);
  }

  // Tenant JWT → 403
  if (TENANT_EMAIL && TENANT_PASSWORD) {
    const tenant = await login(TENANT_EMAIL, TENANT_PASSWORD);
    record('tenant', 'login', tenant.status === 201 || tenant.status === 200, `status ${tenant.status}`, tenant.ms);
    if (tenant.token) {
      for (const route of BFF_ROUTES) {
        const r = await bffGet(route, tenant.token);
        record('bff', `${route} tenant JWT → 403`, r.status === 403, `got ${r.status}`, r.ms);
      }

      const tenantApis = [
        ['dashboard', '/v1/tenant/dashboard'],
        ['extension hub', '/v1/tenant/extensions/hub'],
        ['extension hub stats', '/v1/tenant/extensions/hub/stats'],
        ['dids', '/v1/tenant/dids'],
        ['voicemail', '/v1/tenant/voicemail'],
        ['inbound routes', '/v1/tenant/routing/inbound'],
        ['cdr', '/v1/tenant/cdr?limit=5'],
        ['recordings', '/v1/tenant/recordings?limit=5'],
      ];
      for (const [name, ep] of tenantApis) {
        const r = await api('GET', ep, tenant.token);
        record('tenant', name, r.ok, `status ${r.status}`, r.ms);
      }
    }
  } else {
    record('tenant', 'credentials', false, 'No tenant credentials');
  }

  // Platform admin
  if (PLATFORM_EMAIL && PLATFORM_PASSWORD) {
    const platform = await login(PLATFORM_EMAIL, PLATFORM_PASSWORD);
    record('platform', 'login', platform.token != null, `status ${platform.status}`, platform.ms);
    if (platform.token) {
      for (const route of BFF_ROUTES) {
        const r = await bffGet(route, platform.token);
        record(
          'bff',
          `${route} platform admin → 200/503`,
          r.status === 200 || r.status === 503,
          `got ${r.status}`,
          r.ms,
        );
      }
      const platformApis = [
        ['dashboard', '/v1/platform/dashboard'],
        ['tenants', '/v1/platform/tenants'],
        ['telnyx numbers', '/v1/carriers/telnyx/numbers'],
        ['extensions', '/v1/extensions'],
      ];
      for (const [name, ep] of platformApis) {
        const r = await api('GET', ep, platform.token);
        record('platform', name, r.ok, `status ${r.status}`, r.ms);
      }
    }
  } else {
    record('platform', 'credentials', false, 'PLATFORM_EMAIL/PASSWORD not set — set for full platform E2E');
  }

  const failed = results.filter((r) => !r.pass);
  const slowest = [...perf].sort((a, b) => b.ms - a.ms).slice(0, 5);

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    adminBase: ADMIN_BASE,
    results,
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    performance: { slowest, avgMs: perf.length ? Math.round(perf.reduce((s, p) => s + p.ms, 0) / perf.length) : 0 },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\nReport:', OUT);
  console.log(`${report.summary.passed}/${report.summary.total} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
