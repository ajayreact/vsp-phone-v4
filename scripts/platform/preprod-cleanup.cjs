#!/usr/bin/env node
'use strict';

/**
 * VSP Phone 5 — Pre-Production Cleanup
 *
 * 1) Purge development / verification tenants (verify-/signoff-/test-/demo-/…)
 * 2) Soft-delete leftover test users on kept tenants
 * 3) Reset device provisioning (soft-delete devices + clear Redis MAC index)
 *    so "MAC already enrolled" cannot block re-provisioning
 *
 * NEVER touches: Platform, VSP INTERNAL, inventory tenant.
 *
 * Usage (on EC2):
 *   cd /opt/vsp-phone-v4
 *   set -a && source .env && set +a
 *
 *   # Preview only
 *   node scripts/platform/preprod-cleanup.cjs --dry-run
 *
 *   # Execute (required) — needs PLATFORM_EMAIL / PLATFORM_PASSWORD in env
 *   node scripts/platform/preprod-cleanup.cjs --confirm
 *
 *   # No API login (SQL + Redis only) — use when .env has no platform password
 *   node scripts/platform/preprod-cleanup.cjs --confirm --sql-only
 *
 *   # Skip device/provisioning reset (tenants/users only)
 *   node scripts/platform/preprod-cleanup.cjs --confirm --skip-provisioning-reset
 *
 *   # Only clear Redis MAC keys (no SQL soft-delete of devices)
 *   node scripts/platform/preprod-cleanup.cjs --confirm --redis-mac-only
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const {
  cleanupTempTenant,
  isProtectedTenant,
  runSql,
  sqlLiteral,
} = require('./lib/e2e-tenant-cleanup.cjs');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch {
  /* optional */
}
loadEnvFile(path.resolve(process.cwd(), '.env'));

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(
  /\/$/,
  '',
);
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';
const REPO_ROOT = process.env.REPO_ROOT || '/opt/vsp-phone-v4';
const COMPOSE =
  process.env.COMPOSE ||
  'docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env';

/** Broader than verify-only purge — still never matches protected tenants. */
const TEMP_SLUG_RE = /^(verify|signoff|ext-e2e|test|temp|tmp|demo|sandbox)-/i;
/** Name patterns from E2E / sign-off scripts only — avoid matching real customers like "Test Labs". */
const TEMP_NAME_RE =
  /^(verify\s+org\b|signoff\b|test\s+(tenant|org|user)\b|temporary\s+(tenant|org)\b|demo\s+(tenant|org)\b|sandbox\b)/i;

const TEMP_USER_EMAIL_RE =
  /(verify|signoff|test|temporary|temp\.|demo|sandbox|\+e2e)/i;
const TEMP_USER_NAME_RE =
  /^(verify|signoff|test|temporary|temp|demo|sandbox)\b/i;

const PROTECTED_USER_EMAIL_RE =
  /(platform\.admin|super\.admin|vsp\.admin|@vspphone\.com$)/i;

function argvHas(flag) {
  return process.argv.includes(flag);
}

function normalizeMac(mac) {
  return String(mac || '')
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '');
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

function isTempTenant(tenant) {
  if (!tenant || tenant.deletedAt) return false;
  if (isProtectedTenant(tenant)) return false;
  const slug = String(tenant.slug || '');
  const name = String(tenant.name || tenant.displayName || '');
  return TEMP_SLUG_RE.test(slug) || TEMP_NAME_RE.test(name.trim());
}

function isTempUser(user) {
  if (!user?.id || user.deletedAt) return false;
  const email = String(user.email || '');
  const name = String(
    user.displayName || user.name || user.profile?.displayName || '',
  ).trim();
  if (PROTECTED_USER_EMAIL_RE.test(email)) return false;
  if (/platform/i.test(email) && /admin/i.test(email) && !TEMP_USER_EMAIL_RE.test(email)) {
    return false;
  }
  return TEMP_USER_EMAIL_RE.test(email) || TEMP_USER_NAME_RE.test(name);
}

function redisCli(args) {
  const cwd = fs.existsSync(REPO_ROOT) ? REPO_ROOT : process.cwd();
  return execSync(`${COMPOSE} exec -T redis redis-cli ${args}`, {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function clearRedisMacKeys(macs, { dryRun }) {
  const unique = [...new Set(macs.map(normalizeMac).filter((m) => m.length === 12))];
  let deleted = 0;
  for (const mac of unique) {
    const keys = [`vsp:prov:mac:${mac}`, `vsp:prov:quarantine:${mac}`];
    for (const key of keys) {
      if (dryRun) {
        console.log(`  [dry-run] DEL ${key}`);
        continue;
      }
      try {
        redisCli(`DEL ${key}`);
        deleted += 1;
      } catch (err) {
        console.warn(`  WARN redis DEL ${key}: ${err.message || err}`);
      }
    }
  }

  // Sweep any leftover MAC index keys (V3 leftovers)
  try {
    if (dryRun) {
      const listed = redisCli(`KEYS vsp:prov:mac:*`);
      const keys = listed ? listed.split(/\r?\n/).filter(Boolean) : [];
      console.log(`  [dry-run] would sweep ${keys.length} Redis keys matching vsp:prov:mac:*`);
      for (const k of keys.slice(0, 20)) console.log(`    ${k}`);
      if (keys.length > 20) console.log(`    … +${keys.length - 20} more`);
    } else {
      const listed = redisCli(`KEYS vsp:prov:mac:*`);
      const keys = listed && listed !== '' ? listed.split(/\r?\n/).filter(Boolean) : [];
      for (const key of keys) {
        redisCli(`DEL ${key}`);
        deleted += 1;
      }
      const qListed = redisCli(`KEYS vsp:prov:quarantine:*`);
      const qKeys = qListed && qListed !== '' ? qListed.split(/\r?\n/).filter(Boolean) : [];
      for (const key of qKeys) {
        redisCli(`DEL ${key}`);
        deleted += 1;
      }
    }
  } catch (err) {
    console.warn(`  WARN redis KEYS sweep: ${err.message || err}`);
  }

  return { macCount: unique.length, deleted };
}

function listActiveDeviceMacs() {
  try {
    const out = runSql(
      `SELECT mac_address FROM devices WHERE deleted_at IS NULL AND mac_address IS NOT NULL AND mac_address <> ''`,
    );
    if (!out) return [];
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn(`WARN list device MACs: ${err.message || err}`);
    return [];
  }
}

function resetProvisioningSql({ dryRun }) {
  const steps = [
    {
      label: 'soft-delete active devices',
      sql: `UPDATE devices SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE', provisioning_status = 'PENDING' WHERE deleted_at IS NULL`,
    },
    {
      label: 'end open device assignments',
      sql: `UPDATE device_assignments SET effective_to = NOW(), updated_at = NOW() WHERE effective_to IS NULL AND deleted_at IS NULL`,
    },
  ];

  for (const step of steps) {
    if (dryRun) {
      console.log(`  [dry-run] ${step.label}`);
      console.log(`           ${step.sql}`);
      continue;
    }
    try {
      runSql(step.sql);
      console.log(`  OK ${step.label}`);
    } catch (err) {
      console.warn(`  WARN ${step.label}: ${err.message || err}`);
    }
  }
}

function listTempTenantsFromSql() {
  const out = runSql(
    `SELECT id || '|' || COALESCE(slug,'') || '|' || COALESCE(name,'') FROM tenants WHERE deleted_at IS NULL AND slug ~* '^(verify|signoff|ext-e2e|test|temp|tmp|demo|sandbox)-' ORDER BY slug`,
  );
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, slug, name] = line.split('|');
      return { id, slug, name, displayName: name };
    });
}

function softDeleteTempTenantSql(tenant, { dryRun }) {
  const id = sqlLiteral(tenant.id);
  const steps = [
    `UPDATE devices SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE tenant_id = ${id} AND deleted_at IS NULL`,
    `UPDATE extensions SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = ${id} AND deleted_at IS NULL`,
    `UPDATE lines SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = ${id} AND deleted_at IS NULL`,
    `UPDATE users SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE tenant_id = ${id} AND deleted_at IS NULL`,
    `UPDATE number_assignments SET effective_to = NOW(), updated_at = NOW() WHERE tenant_id = ${id} AND effective_to IS NULL AND deleted_at IS NULL`,
    `UPDATE phone_numbers SET line_id = NULL, site_id = NULL, updated_at = NOW() WHERE tenant_id = ${id} AND deleted_at IS NULL`,
    `UPDATE inbound_routes SET deleted_at = NOW(), updated_at = NOW(), enabled = false WHERE tenant_id = ${id} AND deleted_at IS NULL`,
    `UPDATE tenants SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE id = ${id} AND deleted_at IS NULL`,
  ];
  for (const sql of steps) {
    if (dryRun) {
      console.log(`  [dry-run] ${sql.slice(0, 80)}…`);
      continue;
    }
    runSql(sql);
  }
}

function softDeleteTempUsersSql({ dryRun }) {
  const sql = `
UPDATE users SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE'
WHERE deleted_at IS NULL
  AND (
    email ~* '(verify|signoff|temporary|\\\\+e2e|sandbox)'
    OR email ~* '^test[.@]'
    OR email ~* '\\\\.test@'
  )
  AND email !~* '(platform\\\\.admin|super\\\\.admin|vsp\\\\.admin)'
  AND tenant_id IN (
    SELECT id FROM tenants
    WHERE deleted_at IS NULL
      AND lower(COALESCE(slug,'')) IN ('platform','vsp-internal','vsp_internal','inventory','platform-inventory')
  )`;
  if (dryRun) {
    console.log('  [dry-run] soft-delete test users on kept tenants');
    return;
  }
  try {
    runSql(sql.replace(/\s+/g, ' ').trim());
    console.log('  OK soft-deleted matching test users on kept tenants');
  } catch (err) {
    console.warn(`  WARN test users SQL: ${err.message || err}`);
  }
}

function printCredentialHelp() {
  console.error('Missing PLATFORM_EMAIL / PLATFORM_PASSWORD (or SUPER_ADMIN_*) in environment.');
  console.error('');
  console.error('Option A — SQL-only cleanup (no login):');
  console.error('  node scripts/platform/preprod-cleanup.cjs --confirm --sql-only');
  console.error('');
  console.error('Option B — export credentials then re-run (do NOT use source .env if it errors):');
  console.error('  grep -E "^(PLATFORM_|SUPER_ADMIN_)" .env || true');
  console.error('  export PLATFORM_EMAIL="your-platform-admin@example.com"');
  console.error('  export PLATFORM_PASSWORD="your-password"');
  console.error('  node scripts/platform/preprod-cleanup.cjs --confirm');
}

async function runSqlOnlyCleanup({ dryRun, skipProv, redisOnly }) {
  console.log('Mode: SQL + Redis only (no platform API login)\n');

  const keep = runSql(
    `SELECT slug || ' | ' || COALESCE(name,'') FROM tenants WHERE deleted_at IS NULL AND lower(COALESCE(slug,'')) IN ('platform','vsp-internal','vsp_internal','inventory','platform-inventory') ORDER BY slug`,
  );
  console.log('Keep (protected):');
  console.log(keep ? keep.split(/\r?\n/).map((s) => `  ✓ ${s}`).join('\n') : '  (none found)');

  const targets = listTempTenantsFromSql();
  console.log(`\nPurge targets: ${targets.length}`);
  for (const t of targets) console.log(`  ✗ ${t.slug} | ${t.name} | ${t.id}`);

  console.log('\n--- 1) Soft-delete temp tenants (SQL) ---');
  if (!targets.length) console.log('  None matched.');
  for (const t of targets) {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}Cleaning ${t.slug}`);
    softDeleteTempTenantSql(t, { dryRun });
  }

  console.log('\n--- 2) Soft-delete test users on kept tenants (SQL) ---');
  softDeleteTempUsersSql({ dryRun });

  console.log('\n--- 3) Clear device provisioning / MAC enrollment ---');
  const macs = listActiveDeviceMacs();
  console.log(`Active device MAC rows: ${macs.length}`);
  if (skipProv) {
    console.log('  Skipped (--skip-provisioning-reset).');
  } else if (redisOnly) {
    clearRedisMacKeys(macs, { dryRun });
  } else {
    resetProvisioningSql({ dryRun });
    clearRedisMacKeys(macs, { dryRun });
  }

  console.log('\n--- 4) Verification snapshot ---');
  try {
    const activeTemp = runSql(
      `SELECT slug FROM tenants WHERE deleted_at IS NULL AND slug ~* '^(verify|signoff|ext-e2e|test|temp|tmp|demo|sandbox)-' ORDER BY slug`,
    );
    console.log(
      activeTemp
        ? `  Remaining temp tenants:\n${activeTemp
            .split(/\r?\n/)
            .map((s) => `    - ${s}`)
            .join('\n')}`
        : '  Remaining temp tenants: (none)',
    );
  } catch (err) {
    console.warn(`  WARN: ${err.message || err}`);
  }
  try {
    const activeDevices = runSql(`SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL`);
    console.log(`  Active devices remaining: ${String(activeDevices).trim() || '0'}`);
  } catch (err) {
    console.warn(`  WARN: ${err.message || err}`);
  }
  try {
    const macKeys = redisCli(`KEYS vsp:prov:mac:*`);
    const n = macKeys && macKeys !== '' ? macKeys.split(/\r?\n/).filter(Boolean).length : 0;
    console.log(`  Redis vsp:prov:mac:* keys remaining: ${n}`);
  } catch (err) {
    console.warn(`  WARN redis: ${err.message || err}`);
  }
}

async function main() {
  const dryRun = argvHas('--dry-run');
  const confirm = argvHas('--confirm');
  const skipProv = argvHas('--skip-provisioning-reset');
  const redisOnly = argvHas('--redis-mac-only');
  const sqlOnly = argvHas('--sql-only');

  console.log('\n=== VSP Phone 5 Pre-Production Cleanup ===');
  console.log(`API: ${API_BASE}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : confirm ? 'LIVE (--confirm)' : 'PREVIEW (pass --dry-run or --confirm)'}${sqlOnly ? ' + SQL-ONLY' : ''}\n`);

  if (!dryRun && !confirm) {
    console.log('Refusing to mutate without --dry-run or --confirm.');
    console.log('Recommended:');
    console.log('  node scripts/platform/preprod-cleanup.cjs --dry-run --sql-only');
    console.log('  node scripts/platform/preprod-cleanup.cjs --confirm --sql-only');
    process.exit(1);
  }

  if (sqlOnly) {
    await runSqlOnlyCleanup({ dryRun, skipProv, redisOnly });
    console.log('\n=== Pre-production cleanup finished ===\n');
    if (dryRun) console.log('This was a dry-run. Re-run with --confirm --sql-only to apply.\n');
    return;
  }

  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    printCredentialHelp();
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
  const keep = tenants.filter((t) => t && !t.deletedAt && isProtectedTenant(t));
  const purgeTargets = tenants.filter((t) => isTempTenant(t));

  console.log(`Active tenants: ${tenants.filter((t) => t && !t.deletedAt).length}`);
  console.log('Keep (protected):');
  for (const t of keep) {
    console.log(`  ✓ ${t.slug} | ${t.name || t.displayName} | ${t.id}`);
  }
  console.log(`Purge targets: ${purgeTargets.length}`);
  for (const t of purgeTargets) {
    console.log(`  ✗ ${t.slug} | ${t.name || t.displayName} | ${t.id}`);
  }

  // --- 1) Purge temp tenants ---
  console.log('\n--- 1) Purge test / verify tenants ---');
  if (!purgeTargets.length) {
    console.log('  None matched.');
  }
  for (const t of purgeTargets) {
    if (dryRun) {
      console.log(`  [dry-run] would cleanup tenant ${t.slug}`);
      continue;
    }
    console.log(`\nCleaning ${t.slug}…`);
    await cleanupTempTenant({
      api,
      unwrap,
      platformToken,
      tenantToken: null,
      tenant: t,
      allowMissingExpectedSlug: true,
      reportPath: path.join(
        process.cwd(),
        'static',
        'runtime-verification',
        `preprod-cleanup-${t.slug}-${Date.now().toString(36)}.json`,
      ),
    });
  }

  // Expand TEMP_SLUG matching inside cleanupTempTenant — it uses TEMP_SLUG_RE from lib.
  // For tenants matching TEMP_NAME_RE but not lib TEMP_SLUG_RE, soft-delete via SQL fallback.
  if (!dryRun) {
    for (const t of purgeTargets) {
      const slug = String(t.slug || '');
      if (/^(verify|signoff|ext-e2e)-/i.test(slug)) continue; // already handled by cleanupTempTenant
      try {
        console.log(`  Soft-deleting non-verify pattern tenant via SQL: ${slug}`);
        runSql(
          `UPDATE devices SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE tenant_id = ${sqlLiteral(t.id)} AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE extensions SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = ${sqlLiteral(t.id)} AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE lines SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = ${sqlLiteral(t.id)} AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE users SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE tenant_id = ${sqlLiteral(t.id)} AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE tenants SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE id = ${sqlLiteral(t.id)} AND deleted_at IS NULL`,
        );
      } catch (err) {
        console.warn(`  WARN SQL purge ${slug}: ${err.message || err}`);
      }
    }
  }

  // --- 2) Test users on remaining tenants ---
  console.log('\n--- 2) Remove test users on kept tenants ---');
  const usersListed = unwrap(await api('GET', '/v1/platform/users', { token: platformToken }));
  const users = Array.isArray(usersListed) ? usersListed : [];
  const tempUsers = users.filter(isTempUser);
  console.log(`Test users matched: ${tempUsers.length}`);
  for (const u of tempUsers) {
    const label = `${u.email || u.id} (tenant=${u.tenantId || '?'})`;
    if (dryRun) {
      console.log(`  [dry-run] would delete user ${label}`);
      continue;
    }
    const del = await api('DELETE', `/v1/platform/users/${u.id}`, { token: platformToken });
    if (del.ok) console.log(`  OK deleted ${label}`);
    else {
      try {
        runSql(
          `UPDATE users SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE id = ${sqlLiteral(u.id)} AND deleted_at IS NULL`,
        );
        console.log(`  OK SQL soft-deleted ${label}`);
      } catch (err) {
        console.warn(`  WARN delete user ${label}: HTTP ${del.status} / ${err.message || err}`);
      }
    }
  }

  // --- 3) Provisioning reset ---
  console.log('\n--- 3) Clear device provisioning / MAC enrollment ---');
  const macs = listActiveDeviceMacs();
  console.log(`Active device MAC rows: ${macs.length}`);

  if (skipProv) {
    console.log('  Skipped (--skip-provisioning-reset).');
  } else if (redisOnly) {
    const result = clearRedisMacKeys(macs, { dryRun });
    console.log(`  Redis MAC clear: macs=${result.macCount} dels≈${result.deleted}`);
  } else {
    if (!dryRun) {
      resetProvisioningSql({ dryRun: false });
    } else {
      resetProvisioningSql({ dryRun: true });
    }
    const result = clearRedisMacKeys(macs, { dryRun });
    console.log(`  Redis MAC clear: macs=${result.macCount} dels≈${result.deleted}`);
  }

  // --- 4) Verify ---
  console.log('\n--- 4) Verification snapshot ---');
  try {
    const activeTemp = runSql(
      `SELECT slug FROM tenants WHERE deleted_at IS NULL AND slug ~* '^(verify|signoff|ext-e2e|test|temp|tmp|demo|sandbox)-' ORDER BY slug`,
    );
    console.log(
      activeTemp
        ? `  Remaining temp tenants:\n${activeTemp
            .split(/\r?\n/)
            .map((s) => `    - ${s}`)
            .join('\n')}`
        : '  Remaining temp tenants: (none)',
    );
  } catch (err) {
    console.warn(`  WARN tenant verify SQL: ${err.message || err}`);
  }

  try {
    const activeDevices = runSql(`SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL`);
    console.log(`  Active devices remaining: ${String(activeDevices).trim() || '0'}`);
  } catch (err) {
    console.warn(`  WARN device count: ${err.message || err}`);
  }

  try {
    const macKeys = redisCli(`KEYS vsp:prov:mac:*`);
    const n = macKeys && macKeys !== '' ? macKeys.split(/\r?\n/).filter(Boolean).length : 0;
    console.log(`  Redis vsp:prov:mac:* keys remaining: ${n}`);
  } catch (err) {
    console.warn(`  WARN redis verify: ${err.message || err}`);
  }

  console.log('\n=== Pre-production cleanup finished ===\n');
  if (dryRun) {
    console.log('This was a dry-run. Re-run with --confirm to apply.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
