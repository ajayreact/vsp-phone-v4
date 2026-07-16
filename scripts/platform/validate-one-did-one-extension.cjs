#!/usr/bin/env node
'use strict';

/**
 * Post-deploy validation for migration 20260717040000_one_did_one_extension.
 *
 * Checks:
 *  - No duplicate active DIDs per line
 *  - No duplicate extensions per tenant
 *  - No orphan lines / inbound routes (safe soft-delete where possible)
 *
 * Safe repairs (default ON):
 *  - Detach extra DIDs from a line (keep oldest)
 *  - Soft-delete duplicate inbound routes (keep highest priority / oldest)
 *  - Soft-delete inbound routes whose phone_number is gone
 *
 * Unsafe (fail deploy):
 *  - Duplicate extension numbers within a tenant
 *  - Active phone_numbers with duplicate E.164 in same tenant after repair
 *
 *   DATABASE_URL=... node scripts/platform/validate-one-did-one-extension.cjs
 *   ... --no-repair   # validate only
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL || '';
const REPAIR = !process.argv.includes('--no-repair');
const REPORT_PATH =
  process.env.MIGRATION_REPORT_PATH ||
  path.resolve(process.cwd(), 'docs/16-deployment/MIGRATION-ONE-DID-ONE-EXTENSION-REPORT.md');

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(2);
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('pg module not available');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const report = {
    generatedAt: new Date().toISOString(),
    repairEnabled: REPAIR,
    before: {},
    repairs: [],
    after: {},
    fatal: [],
    ok: false,
  };

  try {
    report.before = await collectCounts(client);

    if (REPAIR) {
      const detached = await client.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY line_id ORDER BY created_at ASC, id ASC
          ) AS rn
          FROM phone_numbers
          WHERE deleted_at IS NULL AND line_id IS NOT NULL
        )
        UPDATE phone_numbers pn
        SET line_id = NULL, updated_at = NOW()
        FROM ranked r
        WHERE pn.id = r.id AND r.rn > 1
        RETURNING pn.id
      `);
      if (detached.rowCount) {
        report.repairs.push(`Detached ${detached.rowCount} extra DID(s) from shared lines`);
      }

      const routes = await client.query(`
        WITH ranked_routes AS (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY phone_number_id
            ORDER BY priority ASC, created_at ASC, id ASC
          ) AS rn
          FROM inbound_routes
          WHERE deleted_at IS NULL AND phone_number_id IS NOT NULL
        )
        UPDATE inbound_routes ir
        SET deleted_at = NOW(), enabled = false, updated_at = NOW()
        FROM ranked_routes r
        WHERE ir.id = r.id AND r.rn > 1
        RETURNING ir.id
      `);
      if (routes.rowCount) {
        report.repairs.push(`Soft-deleted ${routes.rowCount} duplicate inbound route(s)`);
      }

      const orphanRoutes = await client.query(`
        UPDATE inbound_routes ir
        SET deleted_at = NOW(), enabled = false, updated_at = NOW()
        WHERE ir.deleted_at IS NULL
          AND ir.phone_number_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM phone_numbers pn
            WHERE pn.id = ir.phone_number_id AND pn.deleted_at IS NULL
          )
        RETURNING ir.id
      `);
      if (orphanRoutes.rowCount) {
        report.repairs.push(`Soft-deleted ${orphanRoutes.rowCount} orphan inbound route(s)`);
      }

      const softDeletedPhones = await client.query(`
        UPDATE phone_numbers
        SET line_id = NULL, updated_at = NOW()
        WHERE deleted_at IS NOT NULL AND line_id IS NOT NULL
        RETURNING id
      `);
      if (softDeletedPhones.rowCount) {
        report.repairs.push(
          `Cleared line_id on ${softDeletedPhones.rowCount} soft-deleted phone number(s)`,
        );
      }
    }

    report.after = await collectCounts(client);

    if (report.after.duplicate_extensions > 0) {
      report.fatal.push(
        `Duplicate extension numbers remain (${report.after.duplicate_extensions} tenant/extension groups). Manual merge required.`,
      );
    }
    if (report.after.duplicate_dids > 0) {
      report.fatal.push(
        `Duplicate DID numbers remain (${report.after.duplicate_dids} tenant/number groups). Manual merge required.`,
      );
    }
    if (report.after.multi_did_lines > 0) {
      report.fatal.push(
        `Lines still have multiple active DIDs (${report.after.multi_did_lines}). Re-run with repair or fix manually.`,
      );
    }
    if (report.after.orphan_lines_with_did > 0) {
      report.fatal.push(
        `Orphan lines with active DID but no extension (${report.after.orphan_lines_with_did}). Manual repair required.`,
      );
    }
    if (report.after.orphan_routes > 0) {
      report.fatal.push(
        `Orphan inbound routes remain (${report.after.orphan_routes}).`,
      );
    }
    if (report.after.orphan_lines > 0) {
      report.repairs.push(
        `Note: ${report.after.orphan_lines} line(s) without extension (no DID) — non-fatal; clean separately if needed.`,
      );
    }

    // Ensure unique indexes exist (idempotent with migration).
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_one_line_active_uidx
        ON phone_numbers (line_id)
        WHERE line_id IS NOT NULL AND deleted_at IS NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS inbound_routes_one_did_active_uidx
        ON inbound_routes (phone_number_id)
        WHERE phone_number_id IS NOT NULL AND deleted_at IS NULL
    `);

    report.ok = report.fatal.length === 0;
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      console.error('\nMIGRATION VALIDATION FAILED — stop deployment');
      process.exit(1);
    }
    console.log('\nMIGRATION VALIDATION PASSED');
  } finally {
    await client.end();
  }
}

async function collectCounts(client) {
  const q = async (sql) => Number((await client.query(sql)).rows[0].c);
  return {
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
    orphan_lines: await q(`
      SELECT COUNT(*)::int AS c FROM lines l
      LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
      WHERE l.deleted_at IS NULL AND e.id IS NULL`),
    orphan_lines_with_did: await q(`
      SELECT COUNT(*)::int AS c FROM lines l
      LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
      WHERE l.deleted_at IS NULL AND e.id IS NULL
        AND EXISTS (
          SELECT 1 FROM phone_numbers pn
          WHERE pn.line_id = l.id AND pn.deleted_at IS NULL
        )`),
    orphan_routes: await q(`
      SELECT COUNT(*)::int AS c FROM inbound_routes ir
      LEFT JOIN phone_numbers pn ON pn.id = ir.phone_number_id AND pn.deleted_at IS NULL
      WHERE ir.deleted_at IS NULL AND ir.phone_number_id IS NOT NULL AND pn.id IS NULL`),
  };
}

function writeReport(report) {
  const lines = [
    '# One DID ↔ One Extension — Migration Validation Report',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${report.generatedAt} |`,
    `| Repair enabled | ${report.repairEnabled} |`,
    `| Result | ${report.ok ? 'PASS' : 'FAIL'} |`,
    '',
    '## Counts (before)',
    '',
    '```json',
    JSON.stringify(report.before, null, 2),
    '```',
    '',
    '## Repairs applied',
    '',
    report.repairs.length ? report.repairs.map((r) => `- ${r}`).join('\n') : '- None',
    '',
    '## Counts (after)',
    '',
    '```json',
    JSON.stringify(report.after, null, 2),
    '```',
    '',
    '## Fatal issues',
    '',
    report.fatal.length ? report.fatal.map((r) => `- ${r}`).join('\n') : '- None',
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
