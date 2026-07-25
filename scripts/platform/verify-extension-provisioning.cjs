#!/usr/bin/env node
'use strict';

/**
 * Read-only provisioning verification for a single extension/authUsername.
 * No writes. No routing/code changes. Run on EC2 where DATABASE_URL resolves
 * to the production DB (see scripts/platform/ec2-print-database-url.sh).
 *
 * Usage:
 *   node scripts/platform/verify-extension-provisioning.cjs 17000
 *   EXT=17000 node scripts/platform/verify-extension-provisioning.cjs
 *
 * DATABASE_URL resolution order: process.env.DATABASE_URL > .env in cwd.
 */

const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const TARGET = process.argv[2] || process.env.EXT || '17000';
const DATABASE_URL = process.env.DATABASE_URL || '';

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Run: export DATABASE_URL=$(bash scripts/platform/ec2-print-database-url.sh)');
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

  const section = (title) => console.log(`\n=== ${title} ===`);
  const print = (rows) => {
    if (!rows.length) {
      console.log('(0 rows)');
    } else {
      console.table ? console.table(rows) : console.log(JSON.stringify(rows, null, 2));
    }
    return rows;
  };

  try {
    // 1) SIP endpoint — exact auth_username match
    section(`1) sip_endpoints WHERE auth_username = '${TARGET}'`);
    const epExact = print(
      (
        await client.query(
          `SELECT id, tenant_id, auth_username, aor, registration_status, last_registered_at, deleted_at
           FROM sip_endpoints
           WHERE auth_username = $1`,
          [TARGET],
        )
      ).rows,
    );

    // 1b) Case-insensitive / fuzzy variant to catch mismatches (whitespace, case, extra digits)
    section(`1b) sip_endpoints WHERE auth_username ILIKE '%${TARGET}%' (mismatch scan)`);
    const epFuzzy = print(
      (
        await client.query(
          `SELECT id, tenant_id, auth_username, aor, registration_status, last_registered_at, deleted_at
           FROM sip_endpoints
           WHERE auth_username ILIKE $1 OR aor ILIKE $1`,
          [`%${TARGET}%`],
        )
      ).rows,
    );

    // 2) Extension
    section(`2) extensions WHERE extension = '${TARGET}'`);
    const extRows = print(
      (
        await client.query(
          `SELECT id, extension, tenant_id, line_id, archived_at, deleted_at, created_at, updated_at
           FROM extensions
           WHERE extension = $1`,
          [TARGET],
        )
      ).rows,
    );

    // 3) Line(s) referenced by that extension
    section('3) lines WHERE id IN (extensions.line_id)');
    const lineIds = extRows.map((r) => r.line_id).filter(Boolean);
    const lineRows = lineIds.length
      ? print(
          (
            await client.query(
              `SELECT id, status, sip_endpoint_id, tenant_id, deleted_at
               FROM lines
               WHERE id = ANY($1::uuid[])`,
              [lineIds],
            )
          ).rows,
        )
      : print([]);

    // 4) Devices + assignments for any matched SIPEndpoint (exact match set)
    section('4) devices + device_assignments for matched sip_endpoints');
    const epIds = epExact.map((r) => r.id);
    const deviceRows = epIds.length
      ? print(
          (
            await client.query(
              `SELECT d.id AS device_id, d.sip_endpoint_id, d.line_id AS device_line_id,
                      d.status AS device_status, d.deleted_at AS device_deleted_at,
                      da.id AS assignment_id, da.line_id AS assignment_line_id,
                      da.effective_from, da.effective_to, da.deleted_at AS assignment_deleted_at
               FROM devices d
               LEFT JOIN device_assignments da ON da.device_id = d.id
               WHERE d.sip_endpoint_id = ANY($1::uuid[])`,
              [epIds],
            )
          ).rows,
        )
      : print([]);

    // 5) Provisioning history (audit_logs) for every entity id touched above
    section('5) audit_logs provisioning history');
    const entityIds = [
      ...epExact.map((r) => r.id),
      ...epFuzzy.map((r) => r.id),
      ...extRows.map((r) => r.id),
      ...lineRows.map((r) => r.id),
      ...deviceRows.map((r) => r.device_id).filter(Boolean),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);

    const historyRows =
      entityIds.length || TARGET
        ? print(
            (
              await client.query(
                `SELECT created_at, action, entity_type, entity_id, entity_public_id, metadata
                 FROM audit_logs
                 WHERE entity_id = ANY($1::uuid[])
                    OR entity_type IN ('Extension','Line','SIPEndpoint','Device')
                       AND metadata::text ILIKE $2
                 ORDER BY created_at DESC
                 LIMIT 50`,
                [entityIds, `%${TARGET}%`],
              )
            ).rows,
          )
        : print([]);

    // --- Diagnosis summary ---
    section('DIAGNOSIS');
    if (!epExact.length && !extRows.length) {
      console.log(
        `No SIPEndpoint.auth_username='${TARGET}' AND no Extension.extension='${TARGET}' exist anywhere. ` +
          `This authUsername/extension was never provisioned in this DB. If Zoiper is registering as '${TARGET}', ` +
          `that value came from the client's own SIP account config (user-entered), not from a provisioned record — ` +
          `check Kamailio REGISTER auth logs for whether the REGISTER for '${TARGET}' is being challenged/accepted at all, ` +
          `and check other tenants' DBs if this environment hosts more than one DB (see ec2-probe-tenant-databases.cjs).`,
      );
    } else if (!epExact.length && extRows.length) {
      console.log(
        `Extension '${TARGET}' EXISTS (id=${extRows[0].id}, tenant=${extRows[0].tenant_id}, line=${extRows[0].line_id}) ` +
          `but no SIPEndpoint has auth_username='${TARGET}'. Check section 1b for a near-miss auth_username ` +
          `(case/whitespace/extra chars) — if found there, that is the mismatch: the extension's SIP credential ` +
          `was provisioned under a DIFFERENT auth_username than the extension number.`,
      );
    } else if (epExact.length) {
      for (const ep of epExact) {
        if (ep.deleted_at) {
          console.log(`SIPEndpoint ${ep.id} is soft-deleted (deleted_at=${ep.deleted_at}) — routing excludes it.`);
        }
      }
      const matchedLines = lineRows.filter((l) => epIds.includes(l.sip_endpoint_id));
      for (const l of lineRows) {
        if (l.deleted_at) console.log(`Line ${l.id} is soft-deleted (deleted_at=${l.deleted_at}) — routing excludes it.`);
        if (l.status !== 'ACTIVE') console.log(`Line ${l.id} status='${l.status}' (not ACTIVE) — routing excludes it.`);
      }
      if (extRows.some((e) => e.archived_at)) {
        console.log(`Extension row is archived (archived_at set) — routing's extension-lookup stage filters archivedAt: null.`);
      }
      if (extRows.some((e) => e.deleted_at)) {
        console.log(`Extension row is soft-deleted (deleted_at set) — routing's extension-lookup stage filters deletedAt: null.`);
      }
      if (!matchedLines.length && lineIds.length) {
        console.log('Extension.line_id does not point at a line whose sip_endpoint_id matches the found endpoint — graph is disconnected.');
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
