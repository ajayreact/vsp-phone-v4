#!/usr/bin/env node
'use strict';

/**
 * Pilot performance / load probe for portal APIs.
 *
 * Modes:
 *   1) API mode (default): measure login + dashboard + search latencies against staging/local
 *   2) DB seed mode (LOAD_SEED=1): create synthetic tenants/extensions for scale probes
 *
 *   API_BASE=... PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
 *   node scripts/platform/pilot-load-test.cjs
 *
 * Env:
 *   LOAD_TENANTS=100|500|1000   (default 100) — concurrent tenant dashboard probes when seeded
 *   LOAD_EXTENSIONS=10000       target extension search volume (DB mode)
 *   LOAD_SEED=1                 create synthetic data (destructive to temp tenants)
 */

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');

const API_BASE = (process.env.API_BASE || 'http://localhost:3333/api').replace(/\/$/, '');
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';
const TENANT_TIERS = (process.env.LOAD_TENANT_TIERS || '100,500,1000')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => n > 0);
const EXT_TARGET = Number(process.env.LOAD_EXTENSIONS || '10000');
const REPORT_PATH =
  process.env.PERF_REPORT_PATH ||
  path.resolve(process.cwd(), 'docs/16-deployment/PERFORMANCE-REPORT.md');

async function api(method, p, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, ok: res.ok, ms };
}

function unwrap(res) {
  return res.json?.data ?? res.json;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx] * 100) / 100;
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? null,
  };
}

async function timedLoop(label, n, fn) {
  const samples = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    try {
      const ms = await fn(i);
      samples.push(ms);
    } catch {
      errors += 1;
    }
  }
  return { label, ...summarize(samples), errors };
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    tiers: TENANT_TIERS,
    extensionTarget: EXT_TARGET,
    metrics: [],
    notes: [],
    ok: false,
  };

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    report.notes.push('Missing PLATFORM_EMAIL / PLATFORM_PASSWORD — wrote template only');
    writeReport(report);
    console.log('Load test credentials missing — report template written');
    process.exit(2);
  }

  const login = await api('POST', '/v1/auth/login', {
    body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD, portal: 'platform' },
  });
  const token = unwrap(login)?.accessToken;
  if (!token) {
    report.notes.push(`Platform login failed HTTP ${login.status}`);
    writeReport(report);
    process.exit(1);
  }
  report.metrics.push({ label: 'platform_login', ...summarize([login.ms]), errors: 0 });

  // Baseline API probes
  const probes = [
    ['platform_dashboard', () => api('GET', '/v1/platform/dashboard', { token })],
    ['platform_tenants_list', () => api('GET', '/v1/platform/tenants', { token })],
    ['platform_users_search', () => api('GET', '/v1/platform/users?search=a', { token })],
    ['telnyx_inventory', () => api('GET', '/v1/carriers/telnyx/numbers?limit=50', { token })],
  ];

  for (const [label, fn] of probes) {
    const samples = [];
    let errors = 0;
    for (let i = 0; i < 20; i++) {
      const res = await fn();
      samples.push(res.ms);
      if (!res.ok) errors += 1;
    }
    report.metrics.push({ label, ...summarize(samples), errors });
  }

  // Tenant-scoped probes if any tenant admin exists via onboard smoke leftover or first tenant
  const tenants = unwrap(await api('GET', '/v1/platform/tenants', { token })) || [];
  const tenantCount = Array.isArray(tenants) ? tenants.length : 0;
  report.notes.push(`Live tenant count at start: ${tenantCount}`);

  // Simulated concurrent tenant dashboard load using platform tenant list endpoints
  for (const tier of TENANT_TIERS) {
    const concurrent = Math.min(tier, Math.max(tenantCount, 1), 50);
    const samples = [];
    let errors = 0;
    const batch = Array.from({ length: concurrent }, () =>
      api('GET', '/v1/platform/tenants', { token }).then((r) => {
        samples.push(r.ms);
        if (!r.ok) errors += 1;
      }),
    );
    const t0 = performance.now();
    await Promise.all(batch);
    const wall = performance.now() - t0;
    report.metrics.push({
      label: `concurrent_tenant_list_x${concurrent}_for_tier_${tier}`,
      ...summarize(samples),
      errors,
      wallMs: Math.round(wall),
    });
    if (tenantCount < tier) {
      report.notes.push(
        `Tier ${tier}: only ${tenantCount} live tenants — concurrency capped at ${concurrent}. Full ${tier}-tenant seed requires LOAD_SEED=1 on a dedicated DB.`,
      );
    }
  }

  // Extension search pressure (tenant portal via impersonation if available)
  if (Array.isArray(tenants) && tenants[0]?.id) {
    const imp = await api('POST', `/v1/platform/tenants/${tenants[0].id}/impersonate`, { token });
    const handoff = unwrap(imp);
    // Some deployments return accessToken directly for API tests
    const tenantToken = handoff?.accessToken || handoff?.token || null;
    if (tenantToken) {
      const extSearch = await timedLoop('tenant_extension_search', 30, async () => {
        const r = await api('GET', '/v1/tenant/extensions?search=10', { token: tenantToken });
        if (!r.ok) throw new Error('ext search failed');
        return r.ms;
      });
      report.metrics.push(extSearch);

      const userSearch = await timedLoop('tenant_user_search', 30, async () => {
        const r = await api('GET', '/v1/tenant/users?search=a', { token: tenantToken });
        if (!r.ok) throw new Error('user search failed');
        return r.ms;
      });
      report.metrics.push(userSearch);

      const dash = await timedLoop('tenant_dashboard', 20, async () => {
        const r = await api('GET', '/v1/tenant/dashboard', { token: tenantToken });
        if (!r.ok) throw new Error('dashboard failed');
        return r.ms;
      });
      report.metrics.push(dash);
    } else {
      report.notes.push(
        'Impersonation did not return tenant accessToken — skipped tenant search/dashboard timings',
      );
    }
  }

  if (process.env.LOAD_SEED === '1') {
    report.notes.push(
      `LOAD_SEED requested for ${EXT_TARGET} extensions — use a dedicated staging DB; not auto-created in this safe probe.`,
    );
  }

  const p95Dashboard =
    report.metrics.find((m) => m.label === 'platform_dashboard')?.p95 ??
    report.metrics.find((m) => m.label === 'tenant_dashboard')?.p95;
  report.ok =
    report.metrics.every((m) => (m.errors ?? 0) === 0) &&
    (p95Dashboard == null || p95Dashboard < 3000);

  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

function writeReport(report) {
  const lines = [
    '# VSP Phone 5 — Performance Report (Pilot Load Probe)',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${report.generatedAt} |`,
    `| API | ${report.apiBase} |`,
    `| Result | ${report.ok ? 'PASS (baseline)' : 'FAIL / INCOMPLETE'} |`,
    `| Extension target | ${report.extensionTarget} |`,
    `| Tenant tiers | ${report.tiers.join(', ')} |`,
    '',
    '## Metrics',
    '',
    '| Probe | n | min | p50 | p95 | p99 | max | errors |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.metrics.map(
      (m) =>
        `| ${m.label} | ${m.n ?? ''} | ${m.min ?? ''} | ${m.p50 ?? ''} | ${m.p95 ?? ''} | ${m.p99 ?? ''} | ${m.max ?? ''} | ${m.errors ?? 0} |`,
    ),
    '',
    '## Notes',
    '',
    ...(report.notes.length ? report.notes.map((n) => `- ${n}`) : ['- None']),
    '',
    '## Interpretation',
    '',
    '- This probe measures **portal API** latency (dashboard, tenant list, user/extension search, DID inventory).',
    '- Full SIPp registration/call load remains in `docs/13-production-validation/RC3_LOAD_TEST_REPORT.md`.',
    '- Tiers 500 / 1,000 tenants and 10,000 extensions require a seeded staging database (`LOAD_SEED=1` on isolated DB).',
    '',
  ];
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
