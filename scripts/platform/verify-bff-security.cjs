#!/usr/bin/env node
'use strict';

/**
 * RC1 BFF security verification.
 *
 * Usage:
 *   node scripts/platform/verify-bff-security.cjs
 *
 * Env:
 *   ADMIN_BASE          — e.g. http://localhost:3001 or https://admin.vspphone.com
 *   API_BASE            — e.g. http://localhost:3000/api
 *   PLATFORM_EMAIL / PLATFORM_PASSWORD
 *   TENANT_EMAIL / TENANT_PASSWORD  — optional, for tenant 403 test
 */

const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const ADMIN_BASE = (process.env.ADMIN_BASE || 'http://localhost:3001').replace(/\/$/, '');
const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';
const TENANT_EMAIL = process.env.TENANT_EMAIL || '';
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || '';

const BFF_ROUTES = [
  '/api/bff/observability/health',
  '/api/bff/observability/dashboard',
  '/api/bff/readiness',
];

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(email, password) {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, token: json.accessToken || null };
}

async function bffGet(route, token, query = '') {
  const url = `${ADMIN_BASE}${route}${query}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

(async () => {
  console.log('\n=== RC1 BFF Security Verification ===');
  console.log('Admin:', ADMIN_BASE);
  console.log('API:', API_BASE);

  for (const route of BFF_ROUTES) {
    const anon = await bffGet(route, null);
    record(`${route} anonymous → 401`, anon.status === 401, `got ${anon.status}`);
  }

  // Cross-tenant query injection should not bypass auth
  const evilQuery = '?tenantId=00000000-0000-4000-8000-000000000099';
  const anonEvil = await bffGet('/api/bff/observability/dashboard', null, evilQuery);
  record('dashboard + evil tenantId anonymous → 401', anonEvil.status === 401, `got ${anonEvil.status}`);

  if (TENANT_EMAIL && TENANT_PASSWORD) {
    const tenantLogin = await login(TENANT_EMAIL, TENANT_PASSWORD);
    if (tenantLogin.token) {
      for (const route of BFF_ROUTES) {
        const r = await bffGet(route, tenantLogin.token);
        // 403 = auth OK, permission denied (expected).
        // 502 = transport failure to /v1/auth/me (details only in admin container logs).
        const pass = r.status === 403;
        record(`${route} tenant JWT → 403`, pass, `got ${r.status}`);
      }
    } else {
      record('tenant login', false, `status ${tenantLogin.status}`);
    }
  } else {
    console.log('[SKIP] tenant JWT → 403 — set TENANT_EMAIL / TENANT_PASSWORD');
  }

  if (PLATFORM_EMAIL && PLATFORM_PASSWORD) {
    const platformLogin = await login(PLATFORM_EMAIL, PLATFORM_PASSWORD);
    if (platformLogin.token) {
      for (const route of BFF_ROUTES) {
        const r = await bffGet(route, platformLogin.token);
        record(
          `${route} platform admin → 200/503`,
          r.status === 200 || r.status === 503,
          `got ${r.status}`,
        );
      }
      // Authenticated platform user: evil tenantId query must not change auth outcome
      const authedEvil = await bffGet('/api/bff/observability/dashboard', platformLogin.token, evilQuery);
      record(
        'dashboard + evil tenantId platform admin → 200/503 (not 401)',
        authedEvil.status === 200 || authedEvil.status === 503,
        `got ${authedEvil.status}`,
      );
    } else {
      record('platform login', false, `status ${platformLogin.status}`);
    }
  } else {
    console.log('[SKIP] platform admin → 200 — set PLATFORM_EMAIL / PLATFORM_PASSWORD');
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
