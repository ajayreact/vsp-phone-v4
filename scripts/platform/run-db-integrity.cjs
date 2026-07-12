#!/usr/bin/env node
'use strict';

/** Run db-integrity-verification.sql via pg and print summary. */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const SQL_FILE = path.join(process.cwd(), 'scripts/platform/db-integrity-verification.sql');
const DATABASE_URL = process.env.DATABASE_URL || '';

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set — cannot run integrity checks');
    process.exit(2);
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('pg module not available');
    process.exit(2);
  }

  const summarySql = `
WITH
orphan_dids AS (
  SELECT pn.id FROM phone_numbers pn
  LEFT JOIN tenants t ON t.id = pn.tenant_id
  WHERE pn.deleted_at IS NULL AND (pn.line_id IS NOT NULL OR pn.status = 'ACTIVE')
    AND (t.id IS NULL OR t.deleted_at IS NOT NULL)
),
orphan_extensions AS (
  SELECT e.id FROM extensions e
  LEFT JOIN lines l ON l.id = e.line_id AND l.deleted_at IS NULL
  LEFT JOIN tenants t ON t.id = e.tenant_id AND t.deleted_at IS NULL
  WHERE e.deleted_at IS NULL AND (l.id IS NULL OR t.id IS NULL OR e.tenant_id <> l.tenant_id)
),
orphan_lines AS (
  SELECT l.id FROM lines l
  LEFT JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL
  LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
  WHERE l.deleted_at IS NULL AND (t.id IS NULL OR e.id IS NULL)
),
orphan_inbound_routes AS (
  SELECT ir.id FROM inbound_routes ir
  LEFT JOIN tenants t ON t.id = ir.tenant_id AND t.deleted_at IS NULL
  WHERE ir.deleted_at IS NULL AND t.id IS NULL
),
dup_extensions AS (
  SELECT tenant_id, "extension" FROM extensions WHERE deleted_at IS NULL
  GROUP BY tenant_id, "extension" HAVING COUNT(*) > 1
),
dup_did_numbers AS (
  SELECT tenant_id, number FROM phone_numbers WHERE deleted_at IS NULL
  GROUP BY tenant_id, number HAVING COUNT(*) > 1
),
chain_breaks AS (
  SELECT pn.id FROM phone_numbers pn
  JOIN lines l ON l.id = pn.line_id AND l.deleted_at IS NULL
  LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
  WHERE pn.deleted_at IS NULL AND pn.line_id IS NOT NULL
    AND (pn.tenant_id <> l.tenant_id OR e.id IS NULL OR e.tenant_id <> pn.tenant_id)
)
SELECT 'orphan_dids' AS check_name, COUNT(*)::bigint AS issue_count FROM orphan_dids
UNION ALL SELECT 'orphan_extensions', COUNT(*) FROM orphan_extensions
UNION ALL SELECT 'orphan_lines', COUNT(*) FROM orphan_lines
UNION ALL SELECT 'orphan_inbound_routes', COUNT(*) FROM orphan_inbound_routes
UNION ALL SELECT 'duplicate_extension_nums', COUNT(*) FROM dup_extensions
UNION ALL SELECT 'duplicate_did_numbers', COUNT(*) FROM dup_did_numbers
UNION ALL SELECT 'did_line_extension_chain_breaks', COUNT(*) FROM chain_breaks
ORDER BY check_name;
`;

  const sql = summarySql;
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const res = await client.query(sql);
    const rows = res[res.length - 1]?.rows ?? res.rows ?? [];
    console.log('\n=== DB Integrity Summary ===');
    if (Array.isArray(rows) && rows.length) {
      for (const row of rows) {
        const count = Number(row.issue_count ?? 0);
        const tag = count === 0 ? 'PASS' : 'FAIL';
        console.log(`[${tag}] ${row.check_name}: ${count}`);
      }
    } else {
      console.log('Query completed — review output manually');
      console.log(JSON.stringify(rows, null, 2));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
