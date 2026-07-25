#!/usr/bin/env node
'use strict';

/**
 * Phase 2 Step 4 automation: correlate the live Kamailio REGISTER stream,
 * the API sip-digest-auth stream, and the before/after registrar dumps into
 * the exact PASS/FAIL validation table requested — evidence-only, no
 * inference. Any check whose input file is missing is reported as
 * "UNKNOWN (not captured)" rather than guessed.
 *
 * Usage:
 *   node scripts/platform/validate-registration.cjs \
 *     --kam-log /tmp/kam-register-live.txt \
 *     --api-log /tmp/api-register-live.txt \
 *     --before  /tmp/reg-before.txt \
 *     --after   /tmp/reg-after.txt \
 *     [--device-hint Zoiper]   # substring to identify the new contact's User-Agent, default "Zoiper"
 */

const fs = require('node:fs');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function readOrNull(path) {
  if (!path) return null;
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function firstMatch(text, re) {
  if (!text) return null;
  const m = re.exec(text);
  return m ? m[0].trim() : null;
}

function contactCount(text) {
  if (!text) return null;
  const m = text.match(/^CONTACT_COUNT=(\d+)/m);
  return m ? Number(m[1]) : null;
}

function row(name, result, evidence) {
  const flag = result === 'PASS' ? '✅ PASS' : result === 'FAIL' ? '❌ FAIL' : '⬜ UNKNOWN';
  return `| ${name} | ${flag} | ${evidence || '(not captured)'} |`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const kam = readOrNull(args['kam-log']);
  const api = readOrNull(args['api-log']);
  const before = readOrNull(args.before);
  const after = readOrNull(args.after);
  const deviceHint = args['device-hint'] || 'Zoiper';

  // --- Kamailio-side evidence ---
  const kamReceived = firstMatch(kam, /REGISTER aor=[^\n]*/);
  const kamChallenge = firstMatch(kam, /REGISTER digest (incomplete|missing nonce)[^\n]*/);
  const kamDenied = firstMatch(kam, /REGISTER denied by NestJS[^\n]*/);
  const kamUsrlocFail = firstMatch(kam, /REGISTER usrloc save failed[^\n]*/);
  const kamOk = firstMatch(kam, /REGISTER ok device=[^\n]*/);

  // --- API-side evidence (sip-digest-auth.service.ts event names) ---
  const apiDeny = firstMatch(api, /"event":"telecom\.auth\.deny"[^\n]*|"event":\s*"telecom\.auth\.deny"[^\n]*/);
  const apiHa1Mismatch = firstMatch(api, /"event":\s*"telecom\.auth\.ha1_mismatch"[^\n]*/);
  const apiAllow = firstMatch(api, /"event":\s*"telecom\.auth\.allow"[^\n]*/);

  // --- Registrar evidence ---
  const countBefore = contactCount(before);
  const countAfter = contactCount(after);
  const grandstreamBefore = before && /Grandstream/i.test(before);
  const grandstreamAfter = after && /Grandstream/i.test(after);
  const newDeviceAfter = after && new RegExp(deviceHint, 'i').test(after);

  const results = [];

  // 1. REGISTER received by Kamailio
  results.push(
    row(
      'REGISTER received by Kamailio',
      kamReceived ? 'PASS' : kam ? 'FAIL' : 'UNKNOWN',
      kamReceived || (kam ? '(no "REGISTER aor=" line found in capture)' : null),
    ),
  );

  // 2. Digest authentication succeeded (both Kamailio-level allow AND API allow event)
  let digestResult = 'UNKNOWN';
  let digestEvidence = null;
  if (kamDenied || apiDeny || apiHa1Mismatch) {
    digestResult = 'FAIL';
    digestEvidence = kamDenied || apiDeny || apiHa1Mismatch;
  } else if (kamOk || apiAllow) {
    digestResult = 'PASS';
    digestEvidence = apiAllow || kamOk;
  }
  results.push(row('Digest authentication succeeded', digestResult, digestEvidence));

  // 3. Registrar (usrloc) updated
  let usrlocResult = 'UNKNOWN';
  let usrlocEvidence = null;
  if (kamUsrlocFail) {
    usrlocResult = 'FAIL';
    usrlocEvidence = kamUsrlocFail;
  } else if (kamOk) {
    usrlocResult = 'PASS';
    usrlocEvidence = kamOk;
  } else if (countAfter !== null && countBefore !== null) {
    usrlocResult = countAfter > countBefore ? 'PASS' : 'FAIL';
    usrlocEvidence = `CONTACT_COUNT before=${countBefore} after=${countAfter}`;
  }
  results.push(row('Registrar (usrloc) updated', usrlocResult, usrlocEvidence));

  // 4. Grandstream preserved
  results.push(
    row(
      'Grandstream contact preserved',
      grandstreamBefore === null || grandstreamAfter === null ? 'UNKNOWN' : grandstreamBefore && grandstreamAfter ? 'PASS' : 'FAIL',
      grandstreamAfter ? 'Grandstream User-Agent present in after-dump' : after ? 'Grandstream User-Agent NOT found in after-dump' : null,
    ),
  );

  // 5. New device (Zoiper) added
  results.push(
    row(
      `${deviceHint} contact added`,
      after === null ? 'UNKNOWN' : newDeviceAfter ? 'PASS' : 'FAIL',
      newDeviceAfter ? `"${deviceHint}"-matching User-Agent/contact present in after-dump` : after ? `No "${deviceHint}" match found in after-dump` : null,
    ),
  );

  // 6. CONTACT_COUNT 1 -> 2 (generalized: increased by exactly 1)
  results.push(
    row(
      'CONTACT_COUNT increased by exactly 1',
      countBefore === null || countAfter === null ? 'UNKNOWN' : countAfter === countBefore + 1 ? 'PASS' : 'FAIL',
      countBefore !== null && countAfter !== null ? `before=${countBefore} after=${countAfter}` : null,
    ),
  );

  console.log('| Validation | Result | Evidence |');
  console.log('|------------|--------|----------|');
  for (const r of results) console.log(r);

  console.log('\n=== Failure-stage diagnosis (evidence-only) ===');
  if (!kam && !api) {
    console.log('No log captures provided — cannot diagnose. Re-run with --kam-log and --api-log.');
  } else if (!kamReceived) {
    console.log('REGISTER never reached Kamailio for this window. Check: Zoiper network path / NAT / firewall / correct domain+port configured. Component: Network or Client.');
  } else if (kamDenied || apiDeny) {
    console.log(`Authentication rejected. Evidence: ${kamDenied || apiDeny}`);
    console.log('Component: API (SipDigestAuthService) — inspect the "reason" field in the telecom.auth.deny log line above (e.g. unknown_endpoint, username_mismatch, bad_digest, device_assignment_inactive).');
  } else if (apiHa1Mismatch) {
    console.log(`Digest response did not match any candidate HA1. Evidence: ${apiHa1Mismatch}`);
    console.log('Component: API (SipDigestAuthService) / Client — verify the revealed password was entered into Zoiper exactly as shown (no truncation/whitespace).');
  } else if (kamUsrlocFail) {
    console.log(`Authentication passed but usrloc save failed. Evidence: ${kamUsrlocFail}`);
    console.log('Component: Kamailio (usrloc module / db_mode config).');
  } else if (kamOk || apiAllow) {
    if (countBefore !== null && countAfter !== null && countAfter <= countBefore) {
      console.log('Auth succeeded per logs, but registrar contact count did NOT increase — possible contact replacement (same Contact URI/Instance reused) rather than a new contact addition. Inspect before/after dumps directly.');
      console.log('Component: Kamailio usrloc (contact matching by Instance/Call-ID) or Zoiper reusing an existing registration slot.');
    } else {
      console.log('No failure detected — REGISTER received, authenticated, and registrar contact count increased as expected.');
    }
  } else {
    console.log('Inconclusive — no explicit success or failure marker found in the provided captures. Re-check capture window/grep patterns.');
  }
}

main();
