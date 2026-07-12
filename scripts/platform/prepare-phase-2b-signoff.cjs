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
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(/\/$/, '');
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || '';
const OUT = path.join(process.cwd(), 'static', 'runtime-verification', '2b-signoff-env.json');

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
  if (process.env.TENANT_EMAIL && process.env.TENANT_PASSWORD) {
    console.log('TENANT_EMAIL already set — skipping onboard.');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
      OUT,
      JSON.stringify({ email: process.env.TENANT_EMAIL, source: 'env', preparedAt: new Date().toISOString() }, null, 2),
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

  const tenantLogin = await api('POST', '/v1/auth/login', {
    body: { email: adminEmail, password: adminPassword },
  });
  const tenantToken = unwrap(tenantLogin)?.accessToken;
  if (!tenantToken) {
    console.error('Tenant login failed', tenantLogin.status);
    process.exit(1);
  }

  const inventory = unwrap(
    await api('GET', '/v1/carriers/telnyx/numbers?status=inventory&limit=5', { token: platformToken }),
  );
  const numbers = Array.isArray(inventory) ? inventory : inventory?.items ?? [];
  if (numbers.length >= 3) {
    const ids = numbers.slice(0, 3).map((n) => n.id || n.phoneNumberId);
    await api('POST', '/v1/carriers/telnyx/numbers/bulk/assign', {
      token: platformToken,
      body: { tenantId: unwrap(onboard).tenant.id, ids, startExtension: '101' },
    });
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
        tenantId: unwrap(onboard).tenant?.id,
        extension101: ext101?.label ?? null,
        preparedAt: new Date().toISOString(),
        baseUrl: 'https://tenant.vspphone.com',
      },
      null,
      2,
    ),
  );

  console.log('Sign-off tenant prepared.');
  console.log('Wrote', OUT);
  console.log('Run Playwright with TENANT_EMAIL / TENANT_PASSWORD from that file.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
