#!/usr/bin/env node
'use strict';

/**
 * Narrow, targeted repair for a single line's caller_ids row.
 *
 * Problem this fixes: a line has a DID directly assigned via
 * phone_numbers.line_id, but the caller_ids row RoutingService actually
 * reads (caller_ids.phone_number_id) is missing or soft-deleted, so
 * callerCtx.callerIdNumber resolves to null even though the tenant owns
 * a usable DID for this exact line.
 *
 * What it does (and nothing else):
 *   1. Finds the ACTIVE phone_numbers row directly assigned to --line-id
 *      (must be exactly one, tenant-scoped) — the "source of truth" DID.
 *   2. Finds the existing caller_ids row for that line (any deleted_at state).
 *   3. UPDATEs ONLY that row: sets phone_number_id to the DID from step 1,
 *      clears deleted_at, bumps version. Scoped by id + tenant_id + line_id.
 *   4. Prints before/after state.
 *
 * Refuses to run (no writes) if:
 *   - the line has zero or more than one directly-assigned active DID
 *   - no existing caller_ids row exists for the line (won't fabricate one)
 *   - the caller_ids row already correctly points at that DID and isn't deleted
 *
 * Usage (on EC2, inside the API container):
 *   docker exec vsp-api node scripts/platform/repair-line-caller-id.cjs --line-id <uuid>
 *   docker exec vsp-api node scripts/platform/repair-line-caller-id.cjs --line-id <uuid> --dry-run
 */

const path = require('node:path');
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch {
  /* dotenv may be pruned from the production image */
}

const DATABASE_URL = process.env.DATABASE_URL || '';
const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const lineId = argVal('--line-id');
const dryRun = args.includes('--dry-run');

async function main() {
  if (!lineId) {
    console.error('Usage: repair-line-caller-id.cjs --line-id <uuid> [--dry-run]');
    process.exit(2);
  }
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Run inside vsp-api container.');
    process.exit(2);
  }
  const pg = require('pg');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const line = (await client.query(
      `SELECT id, tenant_id, name, status, deleted_at FROM lines WHERE id = $1`,
      [lineId],
    )).rows[0];
    if (!line || line.deleted_at) {
      console.error('Line not found or soft-deleted. Aborting — no writes performed.');
      process.exit(1);
    }

    const dids = (await client.query(
      `SELECT id, number, status FROM phone_numbers
       WHERE line_id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND status = 'ACTIVE'`,
      [lineId, line.tenant_id],
    )).rows;
    if (dids.length !== 1) {
      console.error(
        `Expected exactly 1 directly-assigned ACTIVE DID for this line, found ${dids.length}. Aborting — no writes performed.`,
      );
      console.error(JSON.stringify(dids, null, 2));
      process.exit(1);
    }
    const did = dids[0];

    const before = (await client.query(
      `SELECT id, line_id, tenant_id, phone_number_id, caller_id_name, deleted_at, version
       FROM caller_ids WHERE line_id = $1`,
      [lineId],
    )).rows[0];
    if (!before) {
      console.error('No existing caller_ids row for this line — refusing to fabricate one. Aborting.');
      process.exit(1);
    }

    console.log('=== BEFORE ===');
    console.log(JSON.stringify(before, null, 2));
    console.log(`\nTarget DID to link: ${did.number} (${did.id})`);

    const alreadyCorrect = before.phone_number_id === did.id && !before.deleted_at;
    if (alreadyCorrect) {
      console.log('\ncaller_ids row already points at this DID and is not deleted. Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('\n--dry-run: would UPDATE caller_ids SET phone_number_id, deleted_at=NULL, version=version+1 WHERE id=' + before.id + ' AND tenant_id=' + line.tenant_id + ' AND line_id=' + lineId);
      return;
    }

    const { rowCount } = await client.query(
      `UPDATE caller_ids
       SET phone_number_id = $1, deleted_at = NULL, updated_at = now(), version = version + 1
       WHERE id = $2 AND tenant_id = $3 AND line_id = $4`,
      [did.id, before.id, line.tenant_id, lineId],
    );
    if (rowCount !== 1) {
      console.error(`Expected to update exactly 1 row, updated ${rowCount}. Investigate before retrying.`);
      process.exit(1);
    }

    const after = (await client.query(
      `SELECT ci.id, ci.line_id, ci.tenant_id, ci.phone_number_id, ci.caller_id_name, ci.deleted_at, ci.version,
              pn.number AS phone_number_number
       FROM caller_ids ci LEFT JOIN phone_numbers pn ON pn.id = ci.phone_number_id
       WHERE ci.line_id = $1`,
      [lineId],
    )).rows[0];
    console.log('\n=== AFTER ===');
    console.log(JSON.stringify(after, null, 2));
    console.log(`\ncallerCtx.callerIdNumber would now resolve to: "${after.phone_number_number}"`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
