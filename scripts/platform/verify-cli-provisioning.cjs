#!/usr/bin/env node
'use strict';

/**
 * Read-only diagnostic for the "403 CLI_INVALID on outbound PSTN" investigation.
 *
 * Answers, with runtime DB evidence:
 *   1. Does the target line have an assigned DID (phone_numbers.line_id)?
 *   2. Does the target line have a caller_ids row, and does it point at a phone_number?
 *   3. What is the outbound calling policy (call_policies.outbound_enabled)?
 *   4. What would RoutingService's `callerCtx.callerIdNumber` resolve to for this line,
 *      per the exact query shape used in routing.service.ts (lineInclude: callerId.phoneNumber)?
 *   5. Does the owning tenant have ANY usable DID at all (assigned or in its pool)?
 *
 * No writes. No password/credential access. No routing code touched.
 *
 * Usage (on EC2, inside the API container so DATABASE_URL + pg are available):
 *   docker exec vsp-api node scripts/platform/verify-cli-provisioning.cjs --extension 100
 *   docker exec vsp-api node scripts/platform/verify-cli-provisioning.cjs --line-id <uuid>
 */

const path = require('node:path');
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch {
  /* dotenv may be pruned from the production image; DATABASE_URL is already in env there */
}

const DATABASE_URL = process.env.DATABASE_URL || '';
const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const targetExtension = argVal('--extension') || '100';
const targetLineId = argVal('--line-id');

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Run inside vsp-api container.');
    process.exit(2);
  }
  const pg = require('pg');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const lineRow = targetLineId
      ? (await client.query(
          `SELECT l.id, l.tenant_id, l.name, l.status, l.deleted_at
           FROM lines l WHERE l.id = $1`,
          [targetLineId],
        )).rows[0]
      : (await client.query(
          `SELECT l.id, l.tenant_id, l.name, l.status, l.deleted_at
           FROM lines l
           JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
           WHERE e.extension = $1 AND l.deleted_at IS NULL
           ORDER BY l.updated_at DESC
           LIMIT 1`,
          [targetExtension],
        )).rows[0];

    if (!lineRow) {
      console.log(`No line found for ${targetLineId ? `--line-id ${targetLineId}` : `extension ${targetExtension}`}.`);
      return;
    }

    console.log('=== 1. Target line ===');
    console.log(JSON.stringify(lineRow, null, 2));

    const tenantId = lineRow.tenant_id;
    const lineId = lineRow.id;

    // --- Extension row ---
    const ext = (await client.query(
      `SELECT extension, archived_at, deleted_at FROM extensions WHERE line_id = $1 AND deleted_at IS NULL`,
      [lineId],
    )).rows[0];
    console.log('\n=== 2. Extension ===');
    console.log(JSON.stringify(ext ?? null, null, 2));

    // --- Call policy (outbound calling policy) ---
    const policy = (await client.query(
      `SELECT inbound_enabled, outbound_enabled, deleted_at FROM call_policies WHERE line_id = $1`,
      [lineId],
    )).rows[0];
    console.log('\n=== 3. Outbound calling policy (call_policies) ===');
    console.log(JSON.stringify(policy ?? null, null, 2));
    console.log(policy ? `outbound_enabled = ${policy.outbound_enabled}` : 'NO call_policies row for this line (RoutingService default = true via ?? true fallback)');

    // --- DID directly assigned to this line (phone_numbers.line_id) ---
    const assignedDid = (await client.query(
      `SELECT id, number, status, tenant_id, line_id, deleted_at FROM phone_numbers WHERE line_id = $1 AND deleted_at IS NULL`,
      [lineId],
    )).rows;
    console.log('\n=== 4. DID(s) directly assigned to this line (phone_numbers.line_id = lineId) ===');
    console.log(assignedDid.length ? JSON.stringify(assignedDid, null, 2) : 'NONE — no phone_numbers row has line_id pointing at this line.');

    // --- CallerID row for this line (this is EXACTLY the relation RoutingService reads: line.callerId) ---
    const callerId = (await client.query(
      `SELECT ci.id, ci.line_id, ci.phone_number_id, ci.caller_id_name, ci.deleted_at,
              pn.number AS phone_number_number, pn.status AS phone_number_status, pn.deleted_at AS phone_number_deleted_at
       FROM caller_ids ci
       LEFT JOIN phone_numbers pn ON pn.id = ci.phone_number_id
       WHERE ci.line_id = $1`,
      [lineId],
    )).rows[0];
    console.log('\n=== 5. CallerID row for this line (caller_ids, joined to phone_numbers — exact shape of routing.service.ts "callerId: { include: { phoneNumber: true } }") ===');
    console.log(JSON.stringify(callerId ?? null, null, 2));

    // --- Derive what callerCtx.callerIdNumber would resolve to, per routing.service.ts line 1361-1362 ---
    const derivedCallerIdName = callerId?.caller_id_name ?? undefined;
    const derivedCallerIdNumber = callerId?.phone_number_number ?? undefined;
    console.log('\n=== 6. Derived callerCtx fields (per routing.service.ts:1361-1362 logic) ===');
    console.log(`callerCtx.callerIdName   = ${JSON.stringify(derivedCallerIdName ?? null)}`);
    console.log(`callerCtx.callerIdNumber = ${JSON.stringify(derivedCallerIdNumber ?? null)}`);

    // --- Tenant's overall DID inventory (assigned + pool) to see if ANY valid DID exists to assign ---
    const tenantDids = (await client.query(
      `SELECT id, number, status, line_id, site_id, deleted_at
       FROM phone_numbers
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY (line_id IS NOT NULL) DESC, number`,
      [tenantId],
    )).rows;
    console.log(`\n=== 7. Tenant ${tenantId} — full DID inventory (assigned + pool) ===`);
    console.log(tenantDids.length ? JSON.stringify(tenantDids, null, 2) : 'Tenant owns ZERO phone_numbers rows — no DID exists anywhere in this tenant to use as outbound CLI.');

    // --- Final classification ---
    console.log('\n=== 8. Classification ===');
    const cliRawWouldBe = '100'; // dto.cli as observed in telecom.route.outbound.enter runtime log
    console.log(`Observed dto.cli from runtime log (telecom.route.outbound.enter) = "${cliRawWouldBe}"`);
    console.log(`RoutingService line 490: const cliRaw = dto.cli ?? callerCtx.callerIdNumber;`);
    console.log(`Since dto.cli = "${cliRawWouldBe}" is NOT null/undefined, "??" short-circuits and cliRaw = "${cliRawWouldBe}" REGARDLESS of callerCtx.callerIdNumber.`);
    if (derivedCallerIdNumber) {
      console.log(`\n>>> callerCtx.callerIdNumber IS PROVISIONED ("${derivedCallerIdNumber}") but is NEVER USED because dto.cli overrides it.`);
      console.log('>>> CLASSIFICATION: ROUTING LOGIC BUG (provisioning is correct; RoutingService ignores the correctly-provisioned Caller ID).');
    } else if (!callerId || !callerId.phone_number_number) {
      console.log('\n>>> callerCtx.callerIdNumber is NULL/undefined — no CallerID/DID is provisioned for this line.');
      if (tenantDids.length) {
        console.log('>>> Tenant DOES own other DID(s), so this is a PROVISIONING GAP for this specific line (fixable by assigning one of the tenant DIDs above as this line\'s Caller ID) — BUT it is compounded by the ROUTING LOGIC BUG, because even after provisioning a Caller ID, dto.cli ("100") would still override it and CLI_INVALID would still occur.');
        console.log('>>> CLASSIFICATION: BOTH — a provisioning gap AND a routing logic bug. The routing logic bug is the blocking one: it will reject ANY line, provisioned or not, whenever Kamailio sends an extension-shaped cli.');
      } else {
        console.log('>>> Tenant owns NO DIDs at all — provisioning gap at the tenant level.');
        console.log('>>> CLASSIFICATION: PROVISIONING ISSUE (no DID exists to assign) COMPOUNDED BY the routing logic bug (dto.cli would override even a correctly provisioned Caller ID).');
      }
    }

    console.log('\n=== 9. Recommendation ===');
    console.log('Root cause is structural, not data-dependent: routing.service.ts line 490 uses `dto.cli ?? callerCtx.callerIdNumber`,');
    console.log('a nullish-coalesce that only falls back to callerCtx.callerIdNumber when dto.cli is null/undefined.');
    console.log('Kamailio ALWAYS populates cli for OUTBOUND intent (kamailio.cfg: `jansson_set("string","cli","$fU",...)` unconditionally sets it to the caller\'s raw $fU, e.g. the extension "100"), so dto.cli is never null on outbound — callerCtx.callerIdNumber is dead code for this path today, regardless of what is provisioned in the DB.');
    console.log('This confirms the bug reproduces for EVERY desk-phone outbound call, independent of whether that line has a correctly provisioned Caller ID DID.');
    console.log('');
    console.log('Recommended fix (Option A, as you preferred) — do NOT implement yet, pending your go-ahead:');
    console.log('  - Kamailio should stop sending "cli" for OUTBOUND (desk-phone) requests entirely (only carrier-originated INBOUND legs have a legitimate reason to pass a caller-asserted cli).');
    console.log('  - RoutingService then always derives outbound Caller ID from callerCtx.callerIdNumber (the provisioned Line/CallerID→PhoneNumber), which is the authoritative, carrier-validated source.');
    console.log('  - This is minimal (one kamailio.cfg block removed) and does not change RoutingService/CarrierService validation logic at all.');
    console.log('  - Option B (validateCli/RoutingService ignoring extension-shaped cli) is a valid defensive backstop but treats the symptom in the API layer while leaving Kamailio still asserting a fabricated, wrong CLI — recommend doing Option A as the primary fix, optionally Option B as defense-in-depth.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
