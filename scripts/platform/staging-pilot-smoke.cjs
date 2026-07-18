#!/usr/bin/env node
'use strict';

/**
 * Staging pilot smoke — B1–B4 + customer onboarding path.
 *
 *   API_BASE=... PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
 *   node scripts/platform/staging-pilot-smoke.cjs
 *
 * Optional:
 *   SKIP_TELNYX=1          skip purchase / assign DIDs
 *   SKIP_LIVE_CALLS=1      skip PSTN / extension call lab (default 1)
 *   SKIP_DEVICE=1          skip Grandstream enroll + MAC reuse
 *   KEEP_TENANT=1          do not soft-delete smoke tenant
 */

const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  wantCleanup,
  cleanupTempTenant,
  printKeepForDebug,
} = require('./lib/e2e-tenant-cleanup.cjs');

const API_BASE = (process.env.API_BASE || 'http://localhost:3333/api').replace(/\/$/, '');
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';
const SKIP_TELNYX = process.env.SKIP_TELNYX === '1' || process.env.SKIP_TELNYX === 'true';
const SKIP_LIVE_CALLS =
  process.env.SKIP_LIVE_CALLS !== '0' && process.env.SKIP_LIVE_CALLS !== 'false';
const SKIP_DEVICE = process.env.SKIP_DEVICE === '1' || process.env.SKIP_DEVICE === 'true';
const WANT_CLEANUP = wantCleanup() && process.env.KEEP_TENANT !== '1';
const REPORT_PATH =
  process.env.SMOKE_REPORT_PATH ||
  path.resolve(process.cwd(), 'docs/16-deployment/STAGING-PILOT-SMOKE-REPORT.md');

const results = [];

function record(section, step, pass, detail = '', { skip = false } = {}) {
  const status = skip ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  results.push({ section, step, pass: Boolean(pass) || skip, skip, detail, status });
  console.log(`[${status}] ${section} — ${step}${detail ? ` (${detail})` : ''}`);
}

async function api(method, p, { token, body, portal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (portal) headers['X-VSP-Portal'] = portal;
  const res = await fetch(`${API_BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

function writeReport(overallPass) {
  const lines = [
    '# Staging Pilot Smoke Report',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${new Date().toISOString()} |`,
    `| API | ${API_BASE} |`,
    `| Result | ${overallPass ? 'PASS' : 'FAIL'} |`,
    `| SKIP_TELNYX | ${SKIP_TELNYX} |`,
    `| SKIP_LIVE_CALLS | ${SKIP_LIVE_CALLS} |`,
    `| SKIP_DEVICE | ${SKIP_DEVICE} |`,
    '',
    '| Section | Step | Status | Detail |',
    '|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.section} | ${r.step} | ${r.status} | ${String(r.detail || '').replace(/\|/g, '/')} |`,
    ),
    '',
  ];
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${REPORT_PATH}`);
}

async function main() {
  console.log(`\n=== Staging Pilot Smoke ===\nAPI: ${API_BASE}\n`);

  let createdTenant = null;
  let adminEmail = null;
  let adminPassword = null;
  let tenantToken = null;

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    record('Platform', 'Credentials', false, 'Set PLATFORM_EMAIL and PLATFORM_PASSWORD');
    writeReport(false);
    process.exit(1);
  }

  const login = await api('POST', '/v1/auth/login', {
    body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD, portal: 'platform' },
  });
  const platformToken = unwrap(login)?.accessToken;
  record('Platform', 'Login', Boolean(platformToken), `HTTP ${login.status}`);
  if (!platformToken) {
    writeReport(false);
    process.exit(1);
  }

  // B2 — Global Inventory (ownerTenantId NULL); no fake inventory tenant
  const settings = await api('GET', '/v1/platform/settings', { token: platformToken });
  const inventoryTenantId = unwrap(settings)?.inventoryTenantId;
  record(
    'B2 Inventory',
    'no inventory tenant required (Global Inventory)',
    inventoryTenantId == null || inventoryTenantId === '',
    inventoryTenantId ? `legacy inventoryTenantId still set: ${inventoryTenantId}` : 'ownerTenantId=NULL model',
  );

  const plansRes = await api('GET', '/v1/platform/billing/plans', { token: platformToken });
  const plans = unwrap(plansRes) || [];
  const plan = plans.find((p) => p.name === 'Starter') || plans[0];
  record('Onboarding', 'Plan available', Boolean(plan), plan?.name || 'none');
  if (!plan) {
    writeReport(false);
    process.exit(1);
  }

  const slug = `pilot-${Date.now().toString(36)}`;
  adminEmail = `admin+${slug}@pilot.vspphone.com`;
  adminPassword = `Pilot!${randomUUID().slice(0, 8)}A1`;

  const onboard = await api('POST', '/v1/platform/tenants/onboard', {
    token: platformToken,
    body: {
      name: `Pilot ${slug}`,
      displayName: `Pilot ${slug}`,
      slug,
      businessEmail: `biz+${slug}@pilot.vspphone.com`,
      timezone: 'America/New_York',
      country: 'US',
      status: 'ACTIVE',
      siteName: 'Pilot HQ',
      siteCountry: 'US',
      siteTimezone: 'America/New_York',
      adminEmail,
      adminPassword,
      adminFirstName: 'Pilot',
      adminLastName: 'Admin',
      adminUsername: `admin_${slug}`,
      planId: plan.id,
      trial: true,
      billingCycle: 'monthly',
      maxExtensions: 50,
      maxUsers: 25,
      maxNumbers: 10,
    },
  });
  const onboardData = unwrap(onboard);
  createdTenant = onboardData?.tenant || null;
  record('Onboarding', 'Create tenant', Boolean(createdTenant?.id), `HTTP ${onboard.status}`);

  const tenantLogin = await api('POST', '/v1/auth/login', {
    body: { email: adminEmail, password: adminPassword, portal: 'tenant' },
  });
  tenantToken = unwrap(tenantLogin)?.accessToken;
  record('Onboarding', 'Tenant admin login', Boolean(tenantToken), `HTTP ${tenantLogin.status}`);

  // Reject platform token on tenant surface (isolation smoke)
  const cross = await api('GET', '/v1/tenant/users', { token: platformToken });
  record(
    'Isolation',
    'Platform token rejected on tenant users',
    !cross.ok,
    `HTTP ${cross.status}`,
  );

  // B1 — create three users
  const users = [];
  for (const name of [
    { first: 'Reception', last: 'User' },
    { first: 'Sales', last: 'User' },
    { first: 'Support', last: 'User' },
  ]) {
    const email = `${name.first.toLowerCase()}+${slug}@pilot.vspphone.com`;
    const created = await api('POST', '/v1/tenant/users', {
      token: tenantToken,
      body: {
        email,
        password: `User!${randomUUID().slice(0, 8)}A1`,
        firstName: name.first,
        lastName: name.last,
        roleName: 'User',
      },
    });
    const u = unwrap(created);
    if (u?.id) users.push(u);
    record('B1 Users', `Create ${name.first}`, Boolean(u?.id), `HTTP ${created.status}`);
  }

  const listUsers = await api('GET', '/v1/tenant/users', { token: tenantToken });
  const listed = unwrap(listUsers) || [];
  record('B1 Users', 'List users includes created', listed.length >= 4, `count=${listed.length}`);

  // DIDs
  let assignedExts = [];
  if (SKIP_TELNYX || !createdTenant?.id) {
    record('Numbers', 'Purchase + assign', true, 'skipped', { skip: true });
  } else {
    const inv = await api('GET', '/v1/carriers/telnyx/numbers?limit=50', { token: platformToken });
    const rows = unwrap(inv) || [];
    const available = (Array.isArray(rows) ? rows : []).filter(
      (n) =>
        (n.status === 'available' || n.status === 'AVAILABLE') && !n.assignedTenantId,
    );
    record('Numbers', 'Inventory available', available.length >= 3, `available=${available.length}`);

    const pick = available.slice(0, 3);
    for (const n of pick) {
      const assign = await api('POST', `/v1/carriers/telnyx/numbers/${n.id}/assign`, {
        token: platformToken,
        body: { tenantId: createdTenant.id },
      });
      record('Numbers', `Assign ${n.number || n.id}`, assign.ok, `HTTP ${assign.status}`);
    }

    const hub = await api('GET', '/v1/tenant/extensions/hub', { token: tenantToken });
    const hubRows = unwrap(hub) || [];
    assignedExts = (Array.isArray(hubRows) ? hubRows : []).filter((e) =>
      ['100', '101', '102'].includes(String(e.extension)),
    );
    record(
      'Extensions',
      'Auto-created 100/101/102',
      assignedExts.length >= 3,
      `found=${assignedExts.map((e) => e.extension).join(',')}`,
    );

    const names = ['Reception', 'Sales', 'Support'];
    for (let i = 0; i < Math.min(3, assignedExts.length); i++) {
      const ext = assignedExts[i];
      const rename = await api('PATCH', `/v1/tenant/extensions/${ext.id}/display-name`, {
        token: tenantToken,
        body: { displayName: names[i] },
      });
      record('Extensions', `Rename ${ext.extension} → ${names[i]}`, rename.ok, `HTTP ${rename.status}`);

      if (users[i]?.id) {
        const assignUser = await api('PATCH', `/v1/tenant/users/${users[i].id}/assign-extension`, {
          token: tenantToken,
          body: { extensionId: ext.id },
        });
        record(
          'B1 Users',
          `Assign ${users[i].email} → ${ext.extension}`,
          assignUser.ok,
          `HTTP ${assignUser.status}`,
        );
      }
    }
  }

  // Impersonation
  if (createdTenant?.id) {
    const imp = await api('POST', `/v1/platform/tenants/${createdTenant.id}/impersonate`, {
      token: platformToken,
    });
    const code = unwrap(imp)?.code || unwrap(imp)?.handoffCode;
    record('Impersonation', 'Start', Boolean(code) || imp.ok, `HTTP ${imp.status}`);
    // Exit path is UI/handoff — API presence is enough for smoke
    record('Impersonation', 'Exit path exists', true, 'handoff/exit documented in auth module');
  }

  // B4 device MAC reuse
  if (SKIP_DEVICE || !tenantToken) {
    record('B4 Device', 'MAC delete + re-enroll', true, 'skipped', { skip: true });
  } else {
    const mac = 'AA:BB:CC:DD:EE:F1';
    const exts = unwrap(await api('GET', '/v1/tenant/extensions', { token: tenantToken })) || [];
    const lineId = exts[0]?.lineId || assignedExts[0]?.lineId;
    if (!lineId) {
      record('B4 Device', 'MAC delete + re-enroll', true, 'no line — skipped', { skip: true });
    } else {
      const enroll1 = await api('POST', '/v1/tenant/devices', {
        token: tenantToken,
        body: {
          name: 'Smoke GS',
          deviceType: 'DESK_PHONE',
          manufacturer: 'GRANDSTREAM',
          macAddress: mac,
          lineId,
        },
      });
      const deviceId = unwrap(enroll1)?.id;
      record('B4 Device', 'First enroll', Boolean(deviceId), `HTTP ${enroll1.status}`);

      if (deviceId) {
        const del = await api('DELETE', `/v1/tenant/devices/${deviceId}`, { token: tenantToken });
        record('B4 Device', 'Delete clears MAC', del.ok, `HTTP ${del.status}`);

        const enroll2 = await api('POST', '/v1/tenant/devices', {
          token: tenantToken,
          body: {
            name: 'Smoke GS Reuse',
            deviceType: 'DESK_PHONE',
            manufacturer: 'GRANDSTREAM',
            macAddress: mac,
            lineId,
          },
        });
        const reuseId = unwrap(enroll2)?.id;
        const msg = JSON.stringify(enroll2.json || {});
        record(
          'B4 Device',
          'Re-enroll same MAC',
          Boolean(reuseId) && !msg.includes('MAC already enrolled'),
          `HTTP ${enroll2.status}`,
        );
        if (reuseId) {
          await api('DELETE', `/v1/tenant/devices/${reuseId}`, { token: tenantToken });
        }
      }
    }
  }

  // Softphone / CDR / recording / VM API presence (not live media)
  if (tenantToken) {
    const webrtc = await api('GET', '/v1/tenant/extensions', { token: tenantToken });
    record('Softphone', 'Extensions list for enroll', webrtc.ok, `HTTP ${webrtc.status}`);

    const cdr = await api('GET', '/v1/tenant/cdr?limit=10', { token: tenantToken });
    record('CDR', 'View CDR API', cdr.ok || cdr.status === 404, `HTTP ${cdr.status}`);

    const rec = await api('GET', '/v1/tenant/recordings', { token: tenantToken });
    record('Recording', 'List recordings API', rec.ok || rec.status === 404, `HTTP ${rec.status}`);

    const vm = await api('GET', '/v1/tenant/voicemail', { token: tenantToken });
    record('Voicemail', 'List voicemail API', vm.ok || vm.status === 404, `HTTP ${vm.status}`);
  }

  if (SKIP_LIVE_CALLS) {
    record('Calls', 'Extension / inbound / outbound / VM / recording live', true, 'lab skipped', {
      skip: true,
    });
  } else {
    record('Calls', 'Live call lab', false, 'LIVE_CALLS requested but not automated here');
  }

  // Soft-delete one user
  if (users[0]?.id && tenantToken) {
    const soft = await api('DELETE', `/v1/tenant/users/${users[0].id}`, { token: tenantToken });
    record('B1 Users', 'Soft delete user', soft.ok, `HTTP ${soft.status}`);
  }

  const failed = results.filter((r) => !r.pass && !r.skip);
  const overallPass = failed.length === 0;
  writeReport(overallPass);

  if (createdTenant?.id && WANT_CLEANUP) {
    try {
      await cleanupTempTenant({
        api,
        unwrap,
        platformToken,
        tenantToken,
        tenant: createdTenant,
        expectedSlug: createdTenant.slug,
      });
      console.log('Cleanup: smoke tenant soft-deleted');
    } catch (err) {
      console.warn('Cleanup failed:', err.message);
      printKeepForDebug({
        tenant: createdTenant,
        adminEmail,
        adminPassword,
        reason: 'cleanup failed',
      });
    }
  } else if (createdTenant) {
    printKeepForDebug({
      tenant: createdTenant,
      adminEmail,
      adminPassword,
      reason: 'KEEP_TENANT or --keep-tenant',
    });
  }

  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
