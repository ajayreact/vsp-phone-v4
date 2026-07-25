#!/usr/bin/env node
'use strict';

/**
 * Read-only: list every ACTIVE, provisioned SIP endpoint in production,
 * rank candidates by (registered, ACTIVE line, has device assignment),
 * auto-select the best one, run the 8-point readiness checklist against
 * it, and print the exact Zoiper configuration fields for that extension.
 *
 * No code/routing changes. No password is ever read from the DB (SIP
 * secrets are stored as one-way HA1 hashes, not plaintext) — this prints
 * the exact tenant-portal API calls to reveal/reset the real password.
 *
 * Usage (on EC2, needs DATABASE_URL resolvable — see ec2-print-database-url.sh):
 *   docker exec vsp-api node scripts/platform/select-test-extension.cjs
 *   docker exec vsp-api node scripts/platform/select-test-extension.cjs --line-id <uuid>   # force a specific candidate
 */

const path = require('node:path');
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch {
  /* dotenv may be pruned from the production image; DATABASE_URL is already in env there */
}

const DATABASE_URL = process.env.DATABASE_URL || '';
const args = process.argv.slice(2);
const forcedLineId = (() => {
  const i = args.indexOf('--line-id');
  return i >= 0 ? args[i + 1] : null;
})();

const SIP_HOST = process.env.SIP_REGISTRAR_HOST || process.env.PUBLIC_IP || '<EC2_PUBLIC_IP_OR_SIP_REGISTRAR_HOST>';
const SIP_UDP_PORT = process.env.KAMAILIO_SIP_PORT || '5060';
const SIP_TLS_PORT = process.env.KAMAILIO_TLS_PORT || '5061';
const SIP_WSS_PORT = process.env.KAMAILIO_WSS_PORT || '8443';
const API_BASE = process.env.API_BASE || 'https://api.vspphone.com/api';

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Run inside vsp-api container, or: export DATABASE_URL=$(bash scripts/platform/ec2-print-database-url.sh)');
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

  try {
    const { rows } = await client.query(`
      SELECT
        se.id                    AS sip_endpoint_id,
        se.tenant_id              AS endpoint_tenant_id,
        se.auth_username,
        se.aor,
        se.registration_status,
        se.last_registered_at,
        se.deleted_at            AS endpoint_deleted_at,
        t.name                   AS tenant_name,
        t.id                     AS tenant_uuid,
        t.status                 AS tenant_status,
        e.id                     AS extension_id,
        e.extension,
        e.archived_at            AS extension_archived_at,
        e.deleted_at             AS extension_deleted_at,
        COALESCE(l_direct.id, l_dev.id, l_da.id)         AS line_id,
        COALESCE(l_direct.status, l_dev.status, l_da.status)       AS line_status,
        COALESCE(l_direct.deleted_at, l_dev.deleted_at, l_da.deleted_at) AS line_deleted_at,
        d.id                     AS device_id,
        d.status                 AS device_status,
        d.deleted_at             AS device_deleted_at,
        da.id                    AS assignment_id,
        da.line_id               AS assignment_line_id,
        da.effective_to          AS assignment_effective_to,
        cp.inbound_enabled,
        cp.outbound_enabled
      FROM sip_endpoints se
      JOIN tenants t ON t.id = se.tenant_id AND t.deleted_at IS NULL
      LEFT JOIN lines l_direct ON l_direct.sip_endpoint_id = se.id AND l_direct.deleted_at IS NULL
      LEFT JOIN devices d ON d.sip_endpoint_id = se.id AND d.deleted_at IS NULL
      LEFT JOIN lines l_dev ON l_dev.id = d.line_id AND l_dev.deleted_at IS NULL
      LEFT JOIN device_assignments da ON da.device_id = d.id AND da.deleted_at IS NULL AND da.effective_to IS NULL
      LEFT JOIN lines l_da ON l_da.id = da.line_id AND l_da.deleted_at IS NULL
      LEFT JOIN extensions e ON e.line_id = COALESCE(l_direct.id, l_dev.id, l_da.id) AND e.deleted_at IS NULL
      LEFT JOIN call_policies cp ON cp.line_id = COALESCE(l_direct.id, l_dev.id, l_da.id) AND cp.deleted_at IS NULL
      WHERE se.deleted_at IS NULL
      ORDER BY
        (se.registration_status = 'REGISTERED') DESC,
        (COALESCE(l_direct.status, l_dev.status, l_da.status) = 'ACTIVE') DESC,
        (da.id IS NOT NULL) DESC,
        se.last_registered_at DESC NULLS LAST
    `);

    console.log(`=== ${rows.length} SIP endpoint row(s) found (one row per device where applicable) ===\n`);
    const cols = [
      'extension', 'tenant_name', 'tenant_uuid', 'auth_username', 'sip_endpoint_id', 'aor',
      'line_id', 'line_status', 'device_id', 'assignment_id', 'registration_status',
      'last_registered_at', 'outbound_enabled', 'inbound_enabled',
    ];
    for (const r of rows) {
      console.log(cols.map((c) => `${c}=${r[c] ?? 'NULL'}`).join(' | '));
    }

    if (!rows.length) {
      console.log('\nNo SIP endpoints exist in this database at all. Nothing to select — provisioning is required before any live test can run.');
      return;
    }

    let candidate;
    if (forcedLineId) {
      candidate = rows.find((r) => r.line_id === forcedLineId);
      if (!candidate) {
        console.log(`\n--line-id ${forcedLineId} not found among the rows above.`);
        return;
      }
    } else {
      candidate = rows[0]; // already ORDER BY'd by the exact ranking requested
    }

    console.log(`\n=== Auto-selected candidate ===`);
    console.log(JSON.stringify(candidate, null, 2));

    // --- 8-point validation ---
    console.log(`\n=== 8-point readiness validation ===`);
    const checks = [];
    checks.push(['1. SIP endpoint exists', Boolean(candidate.sip_endpoint_id)]);
    checks.push(['2. Extension exists', Boolean(candidate.extension_id)]);
    checks.push(['3. Line exists', Boolean(candidate.line_id)]);
    checks.push(['4. Device assignment exists', Boolean(candidate.assignment_id)]);
    checks.push(['5. Line status is ACTIVE', candidate.line_status === 'ACTIVE']);
    checks.push(['6. Not archived (extension.archived_at IS NULL)', !candidate.extension_archived_at]);
    checks.push([
      '7. Not soft-deleted (endpoint/extension/line/device all deleted_at IS NULL)',
      !candidate.endpoint_deleted_at && !candidate.extension_deleted_at && !candidate.line_deleted_at && !candidate.device_deleted_at,
    ]);
    const lastReg = candidate.last_registered_at ? new Date(candidate.last_registered_at) : null;
    const recentlyRegistered = lastReg && Date.now() - lastReg.getTime() < 60 * 60 * 1000; // 1h heuristic
    checks.push([
      '8. REGISTER currently succeeds (DB proxy: registration_status=REGISTERED AND last_registered_at within 1h — NOT a substitute for a live re-REGISTER test)',
      candidate.registration_status === 'REGISTERED' && recentlyRegistered,
    ]);

    let allPass = true;
    for (const [label, pass] of checks) {
      console.log(`${pass ? '✅' : '❌'} ${label}`);
      if (!pass) allPass = false;
    }

    if (!allPass) {
      console.log(
        '\nNOT all checks passed — do not proceed to SIP capture with this candidate. ' +
          'Fix the failing item(s) above, or re-run with --line-id to pick a different row from the table.',
      );
      return;
    }

    console.log('\nAll 8 checks pass (check #8 is a DB-only proxy — confirm with a live REGISTER once Zoiper is configured).');

    // --- Zoiper config ---
    const domain = (() => {
      const m = /@([^\s;>]+)/.exec(candidate.aor || '');
      return m ? m[1].split(':')[0] : SIP_HOST;
    })();

    console.log(`\n=== Zoiper configuration for extension ${candidate.extension} ===`);
    console.log(`SIP Server (Domain):     ${domain}`);
    console.log(`Outbound Proxy:          ${SIP_HOST} (set explicitly if domain doesn't resolve/route directly to this EC2 host)`);
    console.log(`Username:                ${candidate.extension}`);
    console.log(`Auth Username:           ${candidate.auth_username}`);
    console.log(`Transport:               UDP (default) — TLS available on ${SIP_TLS_PORT}, WSS on ${SIP_WSS_PORT} if UDP/NAT is a problem`);
    console.log(`Port:                    ${SIP_UDP_PORT} (UDP) / ${SIP_TLS_PORT} (TLS) / ${SIP_WSS_PORT} (WSS)`);
    console.log(`Password source:         NOT retrievable from the database (SIP secrets are stored as one-way HA1 hashes, never plaintext).`);
    console.log(`                         Reveal or rotate it via the tenant portal API (requires your tenant-admin JWT):`);
    console.log(`                           curl -s -X POST ${API_BASE}/v1/tenant/lines/${candidate.line_id}/sip-credentials/reveal \\`);
    console.log(`                             -H "Authorization: Bearer <TENANT_ADMIN_JWT>" | jq`);
    console.log(`                         (returns the CURRENT password if the vault still has it; otherwise it silently issues a new one.)`);
    console.log(`                         To force a fresh, known password instead:`);
    console.log(`                           curl -s -X POST ${API_BASE}/v1/tenant/lines/${candidate.line_id}/sip-credentials/reset \\`);
    console.log(`                             -H "Authorization: Bearer <TENANT_ADMIN_JWT>" | jq`);
    console.log(`                         NOTE: reset invalidates any currently-registered device for this line until it re-registers with the new password.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
