#!/usr/bin/env node
'use strict';

/**
 * Phase 1 — Infrastructure validation for RC1.
 * - Platform Inventory tenant exists + configured
 * - Prisma migrations applied
 * - One DID ↔ One Extension checks (+ orphan routes/devices)
 *
 *   DATABASE_URL=... node scripts/platform/rc1-infrastructure-validate.cjs
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const REPORT_PATH =
  process.env.RC1_INFRA_REPORT_PATH ||
  path.resolve(process.cwd(), 'docs/16-deployment/RC1-INFRASTRUCTURE-REPORT.md');

const results = [];

function record(step, pass, detail = '') {
  results.push({ step, pass: Boolean(pass), detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL || '';
  if (!DATABASE_URL) {
    record('DATABASE_URL set', false, 'missing');
    writeReport(false);
    process.exit(1);
  }
  record('DATABASE_URL set', true, 'present');

  let pg;
  try {
    pg = require('pg');
  } catch {
    record('pg module', false, 'not installed');
    writeReport(false);
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    record('PostgreSQL connect', true);
  } catch (err) {
    record('PostgreSQL connect', false, err.message);
    writeReport(false);
    process.exit(1);
  }

  try {
    // Platform Inventory
    const settings = await client.query(
      `SELECT inventory_tenant_id FROM platform_settings ORDER BY created_at ASC LIMIT 1`,
    );
    const invId = settings.rows[0]?.inventory_tenant_id || process.env.VSP_PLATFORM_INVENTORY_TENANT_ID;
    if (!invId) {
      record('Platform Inventory configured', false, 'inventory_tenant_id missing');
    } else {
      const t = await client.query(
        `SELECT id, name, slug, status FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
        [invId],
      );
      if (!t.rows[0]) {
        record('Platform Inventory exists', false, `id=${invId} not found`);
      } else {
        record(
          'Platform Inventory exists',
          true,
          `${t.rows[0].name} (${t.rows[0].slug})`,
        );
      }
    }

    // Migrations — prisma migrate status
    try {
      const out = execSync('npx prisma migrate status', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      const pending = /Following migration|have not yet been applied|not yet been applied/i.test(out);
      const ok = /Database schema is up to date|All migrations have been successfully applied/i.test(out) && !pending;
      record('Prisma migrations deployed', ok, ok ? 'up to date' : out.split('\n').slice(0, 4).join(' '));
    } catch (err) {
      const msg = (err.stdout || err.stderr || err.message || '').toString();
      const upToDate = /up to date|successfully applied/i.test(msg);
      record('Prisma migrations deployed', upToDate, msg.split('\n').slice(0, 3).join(' '));
    }

    // Integrity counts
    const q = async (sql) => Number((await client.query(sql)).rows[0].c);
    const counts = {
      duplicate_extensions: await q(`
        SELECT COUNT(*)::int AS c FROM (
          SELECT 1 FROM extensions WHERE deleted_at IS NULL
          GROUP BY tenant_id, extension HAVING COUNT(*) > 1
        ) x`),
      duplicate_dids: await q(`
        SELECT COUNT(*)::int AS c FROM (
          SELECT 1 FROM phone_numbers WHERE deleted_at IS NULL
          GROUP BY tenant_id, number HAVING COUNT(*) > 1
        ) x`),
      multi_did_lines: await q(`
        SELECT COUNT(*)::int AS c FROM (
          SELECT line_id FROM phone_numbers
          WHERE deleted_at IS NULL AND line_id IS NOT NULL
          GROUP BY line_id HAVING COUNT(*) > 1
        ) x`),
      orphan_routes: await q(`
        SELECT COUNT(*)::int AS c FROM inbound_routes ir
        LEFT JOIN phone_numbers pn ON pn.id = ir.phone_number_id AND pn.deleted_at IS NULL
        WHERE ir.deleted_at IS NULL AND ir.phone_number_id IS NOT NULL AND pn.id IS NULL`),
      orphan_devices_with_mac: await q(`
        SELECT COUNT(*)::int AS c FROM devices
        WHERE deleted_at IS NOT NULL AND mac_address IS NOT NULL`),
      active_devices_dup_mac: await q(`
        SELECT COUNT(*)::int AS c FROM (
          SELECT mac_address FROM devices
          WHERE deleted_at IS NULL AND mac_address IS NOT NULL
          GROUP BY mac_address HAVING COUNT(*) > 1
        ) x`),
    };

    record('No duplicate extensions', counts.duplicate_extensions === 0, `count=${counts.duplicate_extensions}`);
    record('No duplicate DIDs', counts.duplicate_dids === 0, `count=${counts.duplicate_dids}`);
    record('No multi-DID lines', counts.multi_did_lines === 0, `count=${counts.multi_did_lines}`);
    record('No orphan inbound routes', counts.orphan_routes === 0, `count=${counts.orphan_routes}`);
    record(
      'No soft-deleted devices retaining MAC',
      counts.orphan_devices_with_mac === 0,
      `count=${counts.orphan_devices_with_mac}`,
    );
    record(
      'No duplicate active MAC addresses',
      counts.active_devices_dup_mac === 0,
      `count=${counts.active_devices_dup_mac}`,
    );

    // Run safe repair validator (non-fatal if already clean)
    try {
      execSync('node scripts/platform/validate-one-did-one-extension.cjs', {
        encoding: 'utf8',
        stdio: 'inherit',
        env: process.env,
      });
      record('One DID ↔ One Extension validator', true, 'passed');
    } catch {
      record('One DID ↔ One Extension validator', false, 'failed — see migration report');
    }
  } finally {
    await client.end();
  }

  const ok = results.every((r) => r.pass);
  writeReport(ok);
  process.exit(ok ? 0 : 1);
}

function writeReport(ok) {
  const md = [
    '# RC1 — Infrastructure Validation Report',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${new Date().toISOString()} |`,
    `| Result | ${ok ? 'PASS' : 'FAIL'} |`,
    '',
    '| Step | Status | Detail |',
    '|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.step} | ${r.pass ? 'PASS' : 'FAIL'} | ${String(r.detail || '').replace(/\|/g, '/')} |`,
    ),
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, md, 'utf8');
  console.log(`\nWrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
