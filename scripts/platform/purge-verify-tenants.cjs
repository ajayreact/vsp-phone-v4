#!/usr/bin/env node
'use strict';

/**
 * One-shot purge of leftover E2E / sign-off tenants from production.
 *
 * Soft-deletes verify-* / signoff-* / ext-e2e-* tenants (and their users,
 * extensions, devices), returns DIDs to inventory. Never touches Platform,
 * VSP INTERNAL, or the inventory tenant. Preserves audit_logs.
 *
 * Usage (on EC2):
 *   cd /opt/vsp-phone-v4
 *   set -a && source .env && set +a
 *   node scripts/platform/purge-verify-tenants.cjs
 *
 * Optional:
 *   node scripts/platform/purge-verify-tenants.cjs --slugs=verify-mrg88xt5,signoff-mrhyi0kt
 */

const path = require('node:path');
const {
  cleanupTempTenant,
  isProtectedTenant,
  TEMP_SLUG_RE,
  runSql,
} = require('./lib/e2e-tenant-cleanup.cjs');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(
  /\/$/,
  '',
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';

const DEFAULT_SLUGS = [
  'verify-mrg88xt5',
  'verify-mrg9glzd',
  'verify-mrgh8csa',
  'signoff-mrhyi0kt',
];

function parseSlugFilter(argv) {
  const arg = argv.find((a) => a.startsWith('--slugs='));
  if (!arg) return null;
  return arg
    .slice('--slugs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function api(method, urlPath, { token, body } = {}) {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function unwrap(res) {
  return res.json?.data ?? res.json;
}

async function main() {
  console.log(`\n=== Purge verify/signoff tenants ===\nAPI: ${API_BASE}\n`);

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    console.error('Set PLATFORM_EMAIL and PLATFORM_PASSWORD in .env');
    process.exit(1);
  }

  const login = await api('POST', '/v1/auth/login', {
    body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD },
  });
  const platformToken = unwrap(login)?.accessToken;
  if (!platformToken) {
    console.error('Platform login failed', login.status, JSON.stringify(login.json).slice(0, 200));
    process.exit(1);
  }

  const listed = unwrap(await api('GET', '/v1/platform/tenants', { token: platformToken }));
  const tenants = Array.isArray(listed) ? listed : [];

  const slugFilter = parseSlugFilter(process.argv);
  const targets = tenants.filter((t) => {
    if (!t || t.deletedAt) return false;
    if (isProtectedTenant(t)) return false;
    const slug = String(t.slug || '');
    if (!TEMP_SLUG_RE.test(slug)) return false;
    if (slugFilter) return slugFilter.includes(slug);
    // Default: known leftovers OR any verify-/signoff-/ext-e2e- match
    return DEFAULT_SLUGS.includes(slug) || TEMP_SLUG_RE.test(slug);
  });

  console.log(`Active tenants from API: ${tenants.length}`);
  console.log(`Purge targets: ${targets.length}`);
  for (const t of targets) {
    console.log(`  - ${t.slug} | ${t.name || t.displayName} | ${t.id}`);
  }

  if (!targets.length) {
    console.log('\nNo verify-/signoff- tenants to purge.');
  }

  const reports = [];
  for (const t of targets) {
    console.log(`\n--- Cleaning ${t.slug} ---`);
    const report = await cleanupTempTenant({
      api,
      unwrap,
      platformToken,
      tenantToken: null,
      tenant: {
        id: t.id,
        slug: t.slug,
        name: t.name,
        displayName: t.displayName,
      },
      expectedSlug: t.slug,
      allowMissingExpectedSlug: true,
      knownDidIds: [],
    });
    reports.push(report);
  }

  // Final verification
  const after = unwrap(await api('GET', '/v1/platform/tenants', { token: platformToken }));
  const remaining = (Array.isArray(after) ? after : []).filter((t) => !t.deletedAt);
  const leftoverTemp = remaining.filter((t) => TEMP_SLUG_RE.test(String(t.slug || '')));

  console.log('\n=== REMAINING ACTIVE TENANTS ===');
  for (const t of remaining) {
    console.log(`  ${t.slug} | ${t.name || t.displayName}`);
  }

  if (leftoverTemp.length) {
    console.log('\nFAIL: still have verify-/signoff- tenants:');
    for (const t of leftoverTemp) console.log(`  ${t.slug}`);
    process.exit(1);
  }

  // Extra SQL check (catches soft-deleted filter edge cases)
  try {
    const sqlLeft = runSql(
      `SELECT slug FROM tenants WHERE deleted_at IS NULL AND (slug LIKE 'verify-%' OR slug LIKE 'signoff-%' OR slug LIKE 'ext-e2e-%') ORDER BY slug`,
    );
    if (sqlLeft) {
      console.log('\nFAIL (SQL): active temp tenants still present:');
      console.log(sqlLeft);
      process.exit(1);
    }
  } catch (err) {
    console.warn('SQL verify skipped:', err.message);
  }

  console.log('\nPASS: no active verify-/signoff-/ext-e2e- tenants remain.');
  console.log(`Cleanup reports: ${reports.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
