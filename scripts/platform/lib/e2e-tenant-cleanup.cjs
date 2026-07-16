'use strict';

/**
 * Shared cleanup for temporary verification / sign-off tenants.
 * Soft-deletes only the tenant created by the current script run.
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

const TEMP_SLUG_RE = /^(verify|signoff|ext-e2e)-/i;

function hasCleanupFlag(argv = process.argv) {
  return argv.includes('--cleanup');
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
 * @param {string} [opts.expectedSlug] - must match tenant.slug created this run
 * @param {string[]} [opts.knownDidIds] - DID ids assigned during this run
 * @param {string} [opts.reportPath]
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
    pushRetained('tenant', null, 'No tenant id from this run');
    return finalize(report, reportPath);
  }

  if (!isTempScriptTenant(tenant, expectedSlug)) {
    pushRetained(
      'tenant',
      `${tenant.id} (${tenant.slug || '?'})`,
      'Safety block: not a verify-/signoff- tenant from this run, or protected Platform/VSP INTERNAL',
    );
    return finalize(report, reportPath);
  }

  // Resolve inventory tenant (never delete it)
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

  // Collect DIDs owned by this tenant
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

  // Soft-delete devices / extensions via tenant APIs when possible
  if (tenantToken) {
    try {
      const devices = unwrap(await api('GET', '/v1/tenant/devices', { token: tenantToken })) || [];
      const deviceRows = Array.isArray(devices) ? devices : devices?.items ?? [];
      for (const d of deviceRows) {
        const id = d.id;
        if (!id) continue;
        const del = await api('DELETE', `/v1/tenant/devices/${id}`, { token: tenantToken });
        if (del.ok) pushRemoved('device', id);
        else pushRetained('device', id, `DELETE failed HTTP ${del.status}`);
      }
    } catch (err) {
      pushError('delete_devices', err);
    }

    try {
      const hub = unwrap(await api('GET', '/v1/tenant/extensions/hub', { token: tenantToken })) || [];
      const rows = Array.isArray(hub) ? hub : [];
      for (const ext of rows) {
        const id = ext.id;
        if (!id) continue;
        try {
          await api('POST', `/v1/tenant/extensions/${id}/unassign-did`, { token: tenantToken });
        } catch {
          /* optional */
        }
        const del = await api('DELETE', `/v1/tenant/extensions/${id}`, { token: tenantToken });
        if (del.ok) pushRemoved('extension', `${id} (${ext.extension || ext.label || '?'})`);
        else pushRetained('extension', id, `DELETE failed HTTP ${del.status}`);
      }
    } catch (err) {
      pushError('delete_extensions', err);
    }
  } else {
    pushRetained('devices', null, 'No tenant token — skipped device delete');
    pushRetained('extensions', null, 'No tenant token — skipped extension delete');
  }

  // Return DIDs to platform inventory (SQL — no Nest telecom change)
  if (didIds.length === 0) {
    pushRemoved('dids', 'none assigned');
  } else if (!inventoryTenantId) {
    for (const id of didIds) {
      pushRetained('did', id, 'No inventoryTenantId — cannot return to inventory');
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
        pushRetained('did', id, 'SQL return-to-inventory failed (is postgres reachable via compose?)');
      }
    }
  }

  // Soft-delete tenant (preserves audit_logs)
  try {
    const del = await api('DELETE', `/v1/platform/tenants/${tenant.id}`, { token: platformToken });
    if (del.ok) {
      pushRemoved('tenant', `${tenant.id} (${tenant.slug}) soft-deleted`);
    } else {
      pushRetained('tenant', tenant.id, `Soft-delete failed HTTP ${del.status}`);
    }
  } catch (err) {
    pushError('soft_delete_tenant', err);
    pushRetained('tenant', tenant.id, 'Soft-delete threw');
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
  hasCleanupFlag,
  isProtectedTenant,
  isTempScriptTenant,
  cleanupTempTenant,
  printKeepForDebug,
  printCleanupReport,
};
