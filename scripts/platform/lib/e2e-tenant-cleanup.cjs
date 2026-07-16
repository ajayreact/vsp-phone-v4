'use strict';

/**
 * Shared cleanup for temporary verification / sign-off tenants.
 * Soft-deletes only verify-/signoff-/ext-e2e- tenants.
 * Preserves audit_logs. Never touches Platform / VSP INTERNAL / inventory tenants.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PROTECTED_SLUGS = new Set([
  'platform',
  'vsp-internal',
  'vsp_internal',
  'vspinternal',
  'inventory',
  'platform-inventory',
]);

const PROTECTED_NAME_RE =
  /^(platform|vsp\s*internal|vsp\s*platform|platform\s*inventory)$/i;

/** Temporary / verification tenants safe to soft-delete (never Platform / VSP INTERNAL). */
const TEMP_SLUG_RE = /^(verify|signoff|ext-e2e|test|temp|tmp|demo|sandbox)-/i;

/** Cleanup is ON by default. Pass --keep-tenant to retain the temp tenant. */
function wantCleanup(argv = process.argv) {
  if (argv.includes('--keep-tenant') || argv.includes('--no-cleanup')) return false;
  if (argv.includes('--cleanup')) return true;
  return true;
}

/** @deprecated use wantCleanup */
function hasCleanupFlag(argv = process.argv) {
  return wantCleanup(argv);
}

function isProtectedTenant(tenant) {
  if (!tenant) return true;
  const slug = String(tenant.slug || '')
    .trim()
    .toLowerCase();
  const name = String(tenant.name || tenant.displayName || '').trim();
  if (PROTECTED_SLUGS.has(slug)) return true;
  if (PROTECTED_NAME_RE.test(name)) return true;
  if (/vsp\s*internal/i.test(name)) return true;
  return false;
}

function isTempScriptTenant(tenant, expectedSlug) {
  if (!tenant?.id) return false;
  if (isProtectedTenant(tenant)) return false;
  const slug = String(tenant.slug || '');
  if (expectedSlug && slug !== expectedSlug) return false;
  if (!TEMP_SLUG_RE.test(slug)) return false;
  return true;
}

function runSql(sql) {
  const repoRoot = process.env.REPO_ROOT || '/opt/vsp-phone-v4';
  const dbName = process.env.POSTGRES_APP_DB || process.env.POSTGRES_DB || 'vsp_phone_v4';
  const compose =
    process.env.COMPOSE ||
    'docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env';
  const escaped = sql.replace(/"/g, '\\"');
  return execSync(`${compose} exec -T postgres psql -U vsp -d ${dbName} -t -A -c "${escaped}"`, {
    cwd: fs.existsSync(repoRoot) ? repoRoot : process.cwd(),
    encoding: 'utf8',
  }).trim();
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * @param {object} opts
 * @param {(method:string,path:string,opts?:object)=>Promise<{ok:boolean,status:number,json:any}>} opts.api
 * @param {(res:any)=>any} opts.unwrap
 * @param {string} opts.platformToken
 * @param {string|null|undefined} opts.tenantToken
 * @param {{ id:string, slug?:string, name?:string, displayName?:string }} opts.tenant
 * @param {string} [opts.expectedSlug]
 * @param {string[]} [opts.knownDidIds]
 * @param {string} [opts.reportPath]
 * @param {boolean} [opts.allowMissingExpectedSlug] - purge mode: match TEMP_SLUG_RE only
 */
async function cleanupTempTenant(opts) {
  const {
    api,
    unwrap,
    platformToken,
    tenantToken,
    tenant,
    expectedSlug,
    knownDidIds = [],
    reportPath,
    allowMissingExpectedSlug = false,
  } = opts;

  const report = {
    script: path.basename(process.argv[1] || 'unknown'),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    tenantId: tenant?.id ?? null,
    tenantSlug: tenant?.slug ?? null,
    tenantName: tenant?.name || tenant?.displayName || null,
    removed: [],
    retained: [],
    errors: [],
    auditLogs: 'preserved (soft-delete only; audit_logs not deleted)',
  };

  const pushRemoved = (kind, detail) => report.removed.push({ kind, detail });
  const pushRetained = (kind, detail, reason) => report.retained.push({ kind, detail, reason });
  const pushError = (step, err) =>
    report.errors.push({ step, error: err instanceof Error ? err.message : String(err) });

  if (!tenant?.id) {
    pushRetained('tenant', null, 'No tenant id');
    return finalize(report, reportPath);
  }

  const slugOk = allowMissingExpectedSlug
    ? isTempScriptTenant(tenant, undefined)
    : isTempScriptTenant(tenant, expectedSlug);

  if (!slugOk) {
    pushRetained(
      'tenant',
      `${tenant.id} (${tenant.slug || '?'})`,
      'Safety block: not a temp/verify tenant, or protected Platform/VSP INTERNAL',
    );
    return finalize(report, reportPath);
  }

  let inventoryTenantId = null;
  try {
    const settings = unwrap(await api('GET', '/v1/platform/settings', { token: platformToken }));
    inventoryTenantId = settings?.inventoryTenantId || process.env.VSP_PLATFORM_INVENTORY_TENANT_ID || null;
  } catch (err) {
    pushError('resolve_inventory_tenant', err);
  }

  if (inventoryTenantId && tenant.id === inventoryTenantId) {
    pushRetained('tenant', tenant.id, 'Safety block: inventory tenant');
    return finalize(report, reportPath);
  }

  // Collect DIDs
  let didIds = [...new Set(knownDidIds.filter(Boolean))];
  try {
    const listed = unwrap(
      await api('GET', '/v1/carriers/telnyx/numbers?status=all&limit=500', { token: platformToken }),
    );
    const rows = Array.isArray(listed) ? listed : listed?.items ?? [];
    for (const n of rows) {
      if ((n.assignedTenantId || n.tenantId) === tenant.id) {
        didIds.push(n.id || n.phoneNumberId);
      }
    }
    didIds = [...new Set(didIds.filter(Boolean))];
  } catch (err) {
    pushError('list_dids', err);
  }

  // Prefer tenant APIs when we have a token; always fall back to SQL soft-delete
  if (tenantToken) {
    try {
      const devices = unwrap(await api('GET', '/v1/tenant/devices', { token: tenantToken })) || [];
      const deviceRows = Array.isArray(devices) ? devices : devices?.items ?? [];
      for (const d of deviceRows) {
        if (!d.id) continue;
        const del = await api('DELETE', `/v1/tenant/devices/${d.id}`, { token: tenantToken });
        if (del.ok) pushRemoved('device', d.id);
        else pushRetained('device', d.id, `DELETE failed HTTP ${del.status}`);
      }
    } catch (err) {
      pushError('delete_devices_api', err);
    }

    try {
      const hub = unwrap(await api('GET', '/v1/tenant/extensions/hub', { token: tenantToken })) || [];
      for (const ext of Array.isArray(hub) ? hub : []) {
        if (!ext.id) continue;
        try {
          await api('POST', `/v1/tenant/extensions/${ext.id}/unassign-did`, { token: tenantToken });
        } catch {
          /* optional */
        }
        const del = await api('DELETE', `/v1/tenant/extensions/${ext.id}`, { token: tenantToken });
        if (del.ok) pushRemoved('extension', `${ext.id} (${ext.extension || '?'})`);
        else pushRetained('extension', ext.id, `DELETE failed HTTP ${del.status}`);
      }
    } catch (err) {
      pushError('delete_extensions_api', err);
    }
  }

  // Collect MACs before soft-delete so Redis enrollment index can be cleared
  let macs = [];
  try {
    const macOut = runSql(
      `SELECT mac_address FROM devices WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL AND mac_address IS NOT NULL AND mac_address <> ''`,
    );
    if (macOut) {
      macs = macOut
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase().replace(/[^a-f0-9]/g, ''))
        .filter((m) => m.length === 12);
    }
  } catch (err) {
    pushError('list_device_macs_sql', err);
  }

  // SQL soft-delete remaining devices / extensions / lines for this tenant
  try {
    runSql(
      `UPDATE devices SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
    );
    const devicesN = runSql(
      `SELECT COUNT(*) FROM devices WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NOT NULL`,
    );
    pushRemoved('devices_sql', `soft-deleted (count=${devicesN || '0'})`);
  } catch (err) {
    pushError('soft_delete_devices_sql', err);
  }

  // Clear Redis MAC enrollment keys (prevents "MAC already enrolled" after purge)
  if (macs.length) {
    const repoRoot = process.env.REPO_ROOT || '/opt/vsp-phone-v4';
    const compose =
      process.env.COMPOSE ||
      'docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env';
    const cwd = fs.existsSync(repoRoot) ? repoRoot : process.cwd();
    for (const mac of [...new Set(macs)]) {
      for (const key of [`vsp:prov:mac:${mac}`, `vsp:prov:quarantine:${mac}`]) {
        try {
          execSync(`${compose} exec -T redis redis-cli DEL ${key}`, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          pushRemoved('redis_mac', key);
        } catch (err) {
          pushError(`redis_del_${mac}`, err);
        }
      }
    }
  }

  try {
    runSql(
      `UPDATE extensions SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
    );
    const extN = runSql(
      `SELECT COUNT(*) FROM extensions WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NOT NULL`,
    );
    pushRemoved('extensions_sql', `soft-deleted (count=${extN || '0'})`);
  } catch (err) {
    pushError('soft_delete_extensions_sql', err);
  }

  try {
    runSql(
      `UPDATE lines SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
    );
    pushRemoved('lines_sql', 'soft-deleted where present');
  } catch (err) {
    pushError('soft_delete_lines_sql', err);
  }

  // Return DIDs to inventory before tenant delete
  if (didIds.length === 0) {
    // Also discover via SQL in case API list missed them
    try {
      const sqlIds = runSql(
        `SELECT id FROM phone_numbers WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
      );
      if (sqlIds) {
        didIds = sqlIds.split('\n').map((s) => s.trim()).filter(Boolean);
      }
    } catch (err) {
      pushError('list_dids_sql', err);
    }
  }

  if (didIds.length === 0) {
    pushRemoved('dids', 'none assigned');
  } else if (!inventoryTenantId) {
    // Clear line binding even without inventory tenant id
    for (const id of didIds) {
      try {
        runSql(
          `UPDATE number_assignments SET effective_to = NOW(), updated_at = NOW() WHERE phone_number_id = ${sqlLiteral(id)} AND tenant_id = ${sqlLiteral(tenant.id)} AND effective_to IS NULL AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE phone_numbers SET line_id = NULL, site_id = NULL, updated_at = NOW() WHERE id = ${sqlLiteral(id)} AND tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
        );
        pushRetained('did', id, 'Cleared line binding; inventoryTenantId missing so tenant_id not moved');
      } catch (err) {
        pushError(`clear_did_${id}`, err);
      }
    }
  } else {
    for (const id of didIds) {
      try {
        runSql(
          `UPDATE number_assignments SET effective_to = NOW(), updated_at = NOW() WHERE phone_number_id = ${sqlLiteral(id)} AND tenant_id = ${sqlLiteral(tenant.id)} AND effective_to IS NULL AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE inbound_routes SET deleted_at = NOW(), updated_at = NOW(), enabled = false WHERE phone_number_id = ${sqlLiteral(id)} AND tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
        );
        runSql(
          `UPDATE phone_numbers SET tenant_id = ${sqlLiteral(inventoryTenantId)}, line_id = NULL, site_id = NULL, updated_at = NOW() WHERE id = ${sqlLiteral(id)} AND tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
        );
        const out = runSql(
          `SELECT COUNT(*) FROM phone_numbers WHERE id = ${sqlLiteral(id)} AND tenant_id = ${sqlLiteral(inventoryTenantId)} AND deleted_at IS NULL`,
        );
        if (String(out).trim() === '1') {
          pushRemoved('did', `${id} → inventory ${inventoryTenantId}`);
        } else {
          pushRetained('did', id, `Inventory move unverified (psql out=${out || 'empty'})`);
        }
      } catch (err) {
        pushError(`return_did_${id}`, err);
        pushRetained('did', id, 'SQL return-to-inventory failed');
      }
    }
  }

  // Soft-delete users (platform API + SQL fallback)
  try {
    const users = unwrap(
      await api('GET', `/v1/platform/users?tenantId=${encodeURIComponent(tenant.id)}`, {
        token: platformToken,
      }),
    );
    const userRows = Array.isArray(users) ? users : [];
    for (const u of userRows) {
      if (!u.id) continue;
      const del = await api('DELETE', `/v1/platform/users/${u.id}`, { token: platformToken });
      if (del.ok) pushRemoved('user', `${u.id} (${u.email || '?'})`);
      else pushRetained('user', u.id, `DELETE failed HTTP ${del.status}`);
    }
  } catch (err) {
    pushError('soft_delete_users_api', err);
  }

  try {
    runSql(
      `UPDATE users SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
    );
    const usersN = runSql(
      `SELECT COUNT(*) FROM users WHERE tenant_id = ${sqlLiteral(tenant.id)} AND deleted_at IS NOT NULL`,
    );
    pushRemoved('users_sql', `soft-deleted (count=${usersN || '0'})`);
  } catch (err) {
    pushError('soft_delete_users_sql', err);
  }

  // Soft-delete tenant
  try {
    const del = await api('DELETE', `/v1/platform/tenants/${tenant.id}`, { token: platformToken });
    if (del.ok) {
      pushRemoved('tenant', `${tenant.id} (${tenant.slug}) soft-deleted`);
    } else {
      // SQL fallback if API rejects (e.g. already partially cleaned)
      try {
        runSql(
          `UPDATE tenants SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
        );
        pushRemoved('tenant', `${tenant.id} (${tenant.slug}) soft-deleted via SQL`);
      } catch (sqlErr) {
        pushError('soft_delete_tenant_sql', sqlErr);
        pushRetained('tenant', tenant.id, `Soft-delete failed HTTP ${del.status}`);
      }
    }
  } catch (err) {
    pushError('soft_delete_tenant', err);
    try {
      runSql(
        `UPDATE tenants SET deleted_at = NOW(), updated_at = NOW(), status = 'INACTIVE' WHERE id = ${sqlLiteral(tenant.id)} AND deleted_at IS NULL`,
      );
      pushRemoved('tenant', `${tenant.id} (${tenant.slug}) soft-deleted via SQL`);
    } catch (sqlErr) {
      pushError('soft_delete_tenant_sql', sqlErr);
      pushRetained('tenant', tenant.id, 'Soft-delete threw');
    }
  }

  return finalize(report, reportPath);
}

function finalize(report, reportPath) {
  report.finishedAt = new Date().toISOString();
  const out =
    reportPath ||
    path.join(
      process.cwd(),
      'static',
      'runtime-verification',
      `cleanup-report-${report.tenantSlug || 'unknown'}-${Date.now().toString(36)}.json`,
    );
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    report.reportPath = out;
  } catch (err) {
    report.errors.push({
      step: 'write_report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
  printCleanupReport(report);
  return report;
}

function printCleanupReport(report) {
  console.log('\n=== CLEANUP REPORT ===');
  console.log(`Tenant: ${report.tenantName || '?'} (${report.tenantSlug || '?'})`);
  console.log(`ID: ${report.tenantId || '?'}`);
  console.log(`Audit logs: ${report.auditLogs}`);
  console.log('\nRemoved:');
  if (!report.removed.length) console.log('  (none)');
  for (const r of report.removed) console.log(`  - ${r.kind}: ${r.detail}`);
  console.log('\nRetained:');
  if (!report.retained.length) console.log('  (none)');
  for (const r of report.retained) {
    console.log(`  - ${r.kind}: ${r.detail ?? '—'}${r.reason ? ` (${r.reason})` : ''}`);
  }
  if (report.errors.length) {
    console.log('\nErrors:');
    for (const e of report.errors) console.log(`  - ${e.step}: ${e.error}`);
  }
  if (report.reportPath) console.log(`\nWrote ${report.reportPath}`);
  console.log('=== END CLEANUP REPORT ===\n');
}

function printKeepForDebug({ tenant, adminEmail, adminPassword, reason }) {
  console.log('\n=== TENANT KEPT FOR DEBUGGING ===');
  console.log(`Reason: ${reason}`);
  console.log(`Tenant ID:   ${tenant?.id || '?'}`);
  console.log(`Tenant name: ${tenant?.name || tenant?.displayName || '?'}`);
  console.log(`Tenant slug: ${tenant?.slug || '?'}`);
  console.log(`Login email: ${adminEmail || '?'}`);
  console.log(`Login pass:  ${adminPassword || '?'}`);
  console.log('=== END DEBUG TENANT ===\n');
}

module.exports = {
  wantCleanup,
  hasCleanupFlag,
  isProtectedTenant,
  isTempScriptTenant,
  cleanupTempTenant,
  printKeepForDebug,
  printCleanupReport,
  TEMP_SLUG_RE,
  runSql,
  sqlLiteral,
};
