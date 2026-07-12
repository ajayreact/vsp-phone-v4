#!/usr/bin/env node
'use strict';

/**
 * RC1 blocker verification — staging E2E API checks.
 *
 * Usage:
 *   node scripts/platform/verify-rc1-blockers.cjs
 *
 * Env: API_BASE, PLATFORM_EMAIL, PLATFORM_PASSWORD, TENANT_EMAIL, TENANT_PASSWORD
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(
  /\/$/,
  '',
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';
const TENANT_EMAIL = process.env.TENANT_EMAIL || '';
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || '';

const ARTIFACT = path.join(process.cwd(), 'static', 'runtime-verification', 'rc1-blocker-report.json');
const results = [];
const timings = [];

function record(area, step, pass, detail = '', ms = null) {
  results.push({ area, step, pass, detail, ms });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${area} — ${step}${detail ? ` — ${detail}` : ''}${ms != null ? ` (${ms}ms)` : ''}`);
}

async function api(method, urlPath, { token, body } = {}) {
  const url = `${API_BASE}${urlPath}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const started = Date.now();
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ms = Date.now() - started;
  timings.push({ method, url: urlPath, status: res.status, ms });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, ok: res.ok, json, ms };
}

function unwrap(res) {
  return res.json?.data ?? res.json;
}

async function login(email, password) {
  const r = await api('POST', '/v1/auth/login', { body: { email, password } });
  return { ...r, token: unwrap(r)?.accessToken ?? r.json?.accessToken ?? null };
}

(async () => {
  console.log('\n=== RC1 Blocker Verification ===');
  console.log('API:', API_BASE);

  const health = await api('GET', '/health');
  record('env', 'API health', health.ok, health.json?.status, health.ms);

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    record('env', 'platform credentials', false, 'PLATFORM_EMAIL/PASSWORD not set');
    fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
    fs.writeFileSync(ARTIFACT, JSON.stringify({ results, timings }, null, 2));
    process.exit(1);
  }

  const platform = await login(PLATFORM_EMAIL, PLATFORM_PASSWORD);
  record('platform', 'login', platform.ok && Boolean(platform.token), `status ${platform.status}`, platform.ms);
  if (!platform.token) {
    fs.writeFileSync(ARTIFACT, JSON.stringify({ results, timings }, null, 2));
    process.exit(1);
  }

  const platformEndpoints = [
    ['dashboard', 'GET', '/v1/platform/dashboard'],
    ['tenants', 'GET', '/v1/platform/tenants'],
    ['telnyx numbers', 'GET', '/v1/carriers/telnyx/numbers'],
    ['extensions', 'GET', '/v1/extensions'],
  ];

  for (const [name, method, ep] of platformEndpoints) {
    const r = await api(method, ep, { token: platform.token });
    record('platform', name, r.ok, `status ${r.status}`, r.ms);
  }

  const tenants = unwrap(await api('GET', '/v1/platform/tenants', { token: platform.token })) || [];
  const tenantId = Array.isArray(tenants) && tenants[0]?.id;
  if (tenantId) {
    const detail = await api('GET', `/v1/platform/tenants/${tenantId}`, { token: platform.token });
    record('platform', 'tenant detail', detail.ok, `status ${detail.status}`, detail.ms);
  }

  const numbers = unwrap(await api('GET', '/v1/carriers/telnyx/numbers?status=available', { token: platform.token })) || [];
  record('platform', 'available DIDs', Array.isArray(numbers), `count ${Array.isArray(numbers) ? numbers.length : 0}`);

  if (TENANT_EMAIL && TENANT_PASSWORD) {
    const tenant = await login(TENANT_EMAIL, TENANT_PASSWORD);
    record('tenant', 'login', tenant.ok && Boolean(tenant.token), `status ${tenant.status}`, tenant.ms);
    if (tenant.token) {
      const tenantEndpoints = [
        ['dashboard', 'GET', '/v1/tenant/dashboard'],
        ['extension hub', 'GET', '/v1/tenant/extensions/hub'],
        ['extension hub stats', 'GET', '/v1/tenant/extensions/hub/stats'],
        ['my numbers', 'GET', '/v1/tenant/dids'],
        ['voicemail', 'GET', '/v1/tenant/voicemail'],
        ['inbound routes', 'GET', '/v1/tenant/inbound-routes'],
        ['cdr', 'GET', '/v1/tenant/cdr?limit=5'],
        ['recordings', 'GET', '/v1/tenant/recordings?limit=5'],
      ];
      for (const [name, method, ep] of tenantEndpoints) {
        const r = await api(method, ep, { token: tenant.token });
        record('tenant', name, r.ok, `status ${r.status}`, r.ms);
      }
    }
  } else {
    console.log('[SKIP] tenant workflows — TENANT_EMAIL/TENANT_PASSWORD not set');
  }

  // Environment audit (readonly)
  const devAuthVars = ['DEV_AUTH_EMAIL', 'DEV_AUTH_PASSWORD', 'DEV_AUTH_USER_ID', 'DEV_AUTH_TENANT_ID'].filter(
    (k) => process.env[k],
  );
  record('env', 'DEV_AUTH_* unset', devAuthVars.length === 0, devAuthVars.join(', ') || 'none');
  record('env', 'TELECOM_SERVICE_AUTH_TOKEN set', Boolean(process.env.TELECOM_SERVICE_AUTH_TOKEN));

  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, JSON.stringify({ results, timings, generatedAt: new Date().toISOString() }, null, 2));
  console.log('\nReport:', ARTIFACT);

  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
