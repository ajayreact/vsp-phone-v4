#!/usr/bin/env node
'use strict';

/**
 * Prepare tenant credentials + rename 101 → Reception for Phase 2B browser sign-off.
 * Uses PLATFORM_* from .env. Writes static/runtime-verification/2b-signoff-env.json (gitignored pattern).
 *
 * Usage:
 *   node scripts/platform/prepare-phase-2b-signoff.cjs
 *   # then:
 *   $env:BASE_URL='https://tenant.vspphone.com'
 *   $env:TENANT_EMAIL=(Get-Content static/runtime-verification/2b-signoff-env.json | ConvertFrom-Json).email
 *   $env:TENANT_PASSWORD=(Get-Content static/runtime-verification/2b-signoff-env.json | ConvertFrom-Json).password
 *
 * Soft-delete the signoff-* tenant created by this run after prep succeeds:
 *   node scripts/platform/prepare-phase-2b-signoff.cjs --cleanup
 *
 * On failure the tenant is kept and credentials are printed for debugging.
 * Never deletes Platform / VSP INTERNAL / inventory tenants.
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  hasCleanupFlag,
  cleanupTempTenant,
  printKeepForDebug,
} = require('./lib/e2e-tenant-cleanup.cjs');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(
  /\/$/,
  '',
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || '';
const OUT = path.join(process.cwd(), 'static', 'runtime-verification', '2b-signoff-env.json');
const WANT_CLEANUP = hasCleanupFlag();

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
  console.log(`\n=== Phase 2B sign-off prepare ===\nAPI: ${API_BASE}\ncleanup: ${WANT_CLEANUP ? 'ON' : 'OFF'}\n`);

  if (process.env.TENANT_EMAIL && process.env.TENANT_PASSWORD) {
    console.log('TENANT_EMAIL already set — skipping onboard (no cleanup of external tenant).');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        { email: process.env.TENANT_EMAIL, source: 'env', preparedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    return;
  }

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    console.error('Set PLATFORM_EMAIL and PLATFORM_PASSWORD in .env');
    process.exit(1);
  }

  const login = await api('POST', '/v1/auth/login', {
    body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD },
  });
  const platformToken = unwrap(login)?.accessToken;
  if (!platformToken) {
    console.error('Platform login failed', login.status);
    process.exit(1);
  }

  const slug = `signoff-${Date.now().toString(36)}`;
  const adminEmail = `admin+${slug}@verify.vspphone.com`;
  const adminPassword = `Signoff!${randomUUID().slice(0, 8)}`;

  /** @type {{ id: string, slug: string, name: string, displayName?: string } | null} */
  let createdTenant = null;
  /** @type {string[]} */
  let assignedDidIds = [];
  let tenantToken = null;

  const plans = unwrap(await api('GET', '/v1/platform/billing/plans', { token: platformToken })) || [];
  const plan = plans.find((p) => p.name === 'Starter') || plans[0];
  if (!plan) {
    console.error('No billing plan');
    process.exit(1);
  }

  const onboard = await api('POST', '/v1/platform/tenants/onboard', {
    token: platformToken,
    body: {
      name: `Signoff ${slug}`,
      displayName: `Signoff ${slug}`,
      slug,
      businessEmail: `biz+${slug}@verify.vspphone.com`,
      businessPhone: '+1-415-555-0100',
      timezone: 'America/New_York',
      country: 'US',
      status: 'ACTIVE',
      siteName: 'HQ',
      siteCountry: 'US',
      siteTimezone: 'America/New_York',
      adminEmail,
      adminPassword,
      adminFirstName: 'Signoff',
      adminLastName: 'Admin',
      adminUsername: `admin_${slug}`,
      planId: plan.id,
      trial: true,
      billingCycle: 'monthly',
      maxExtensions: 50,
      maxUsers: 10,
      maxNumbers: 20,
    },
  });

  if (!onboard.ok) {
    console.error('Onboard failed', onboard.status, JSON.stringify(onboard.json).slice(0, 300));
    process.exit(1);
  }

  const onboardData = unwrap(onboard);
  createdTenant = {
    id: onboardData.tenant.id,
    slug: onboardData.tenant.slug || slug,
    name: onboardData.tenant.name || `Signoff ${slug}`,
    displayName: onboardData.tenant.displayName || `Signoff ${slug}`,
  };

  const tenantLogin = await api('POST', '/v1/auth/login', {
    body: { email: adminEmail, password: adminPassword },
  });
  tenantToken = unwrap(tenantLogin)?.accessToken || null;
  if (!tenantToken) {
    printKeepForDebug({
      tenant: createdTenant,
      adminEmail,
      adminPassword,
      reason: 'Tenant login failed after onboard — tenant retained for debugging',
    });
    process.exit(1);
  }

  const inventory = unwrap(
    await api('GET', '/v1/carriers/telnyx/numbers?status=inventory&limit=5', { token: platformToken }),
  );
  const numbers = Array.isArray(inventory) ? inventory : inventory?.items ?? [];
  if (numbers.length >= 3) {
    const ids = numbers.slice(0, 3).map((n) => n.id || n.phoneNumberId).filter(Boolean);
    assignedDidIds = ids;
    const assign = await api('POST', '/v1/carriers/telnyx/numbers/bulk/assign', {
      token: platformToken,
      body: { tenantId: createdTenant.id, ids, startExtension: '101' },
    });
    if (!assign.ok) {
      printKeepForDebug({
        tenant: createdTenant,
        adminEmail,
        adminPassword,
        reason: `DID assign failed HTTP ${assign.status} — tenant retained for debugging`,
      });
      process.exit(1);
    }
  }

  const hub = unwrap(await api('GET', '/v1/tenant/extensions/hub', { token: tenantToken })) || [];
  const ext101 = hub.find((r) => r.extension === '101') || hub[0];
  if (ext101) {
    await api('PATCH', `/v1/tenant/extensions/${ext101.id}/display-name`, {
      token: tenantToken,
      body: { displayName: 'Reception' },
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        email: adminEmail,
        password: adminPassword,
        slug,
        tenantId: createdTenant.id,
        extension101: ext101?.label ?? null,
        preparedAt: new Date().toISOString(),
        baseUrl: 'https://tenant.vspphone.com',
        cleanup: WANT_CLEANUP,
      },
      null,
      2,
    ),
  );

  console.log('Sign-off tenant prepared.');
  console.log('Wrote', OUT);

  if (WANT_CLEANUP) {
    await cleanupTempTenant({
      api,
      unwrap,
      platformToken,
      tenantToken,
      tenant: createdTenant,
      expectedSlug: slug,
      knownDidIds: assignedDidIds,
    });
    console.log('Note: --cleanup removed the sign-off tenant. Omit --cleanup when preparing for Playwright.');
  } else {
    console.log('Run Playwright with TENANT_EMAIL / TENANT_PASSWORD from that file.');
    printKeepForDebug({
      tenant: createdTenant,
      adminEmail,
      adminPassword,
      reason: 'Prep succeeded without --cleanup — tenant retained for browser sign-off',
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
