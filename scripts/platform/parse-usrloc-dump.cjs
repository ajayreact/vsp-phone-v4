#!/usr/bin/env node
'use strict';

/**
 * Robustly parse a Kamailio usrloc dump captured by show-registrar-contacts.sh
 * and print an accurate AoR/contact count + per-contact detail for a target
 * AoR/extension. Handles the JSON shape produced by `kamctl ul show`
 * (nested AoRs[].Info.{AoR,Contacts[].Contact}) and degrades to a raw-text
 * fallback if the input isn't valid JSON (e.g. raw kamcmd binrpc text).
 *
 * Usage: node scripts/platform/parse-usrloc-dump.cjs <dump-file> [target]
 */

const fs = require('node:fs');

const file = process.argv[2];
const target = process.argv[3] || '';

if (!file) {
  console.error('Usage: node parse-usrloc-dump.cjs <dump-file> [target]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

function rawFallback(reason) {
  console.log(`(Input is not parseable as JSON — ${reason}. Falling back to raw text context.)`);
  if (!target) return;
  const lines = raw.split('\n');
  let printed = false;
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(target.toLowerCase())) {
      printed = true;
      console.log(lines.slice(Math.max(0, i - 2), i + 10).join('\n'));
      console.log('---');
    }
  });
  if (!printed) console.log(`No raw lines matched '${target}'.`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  rawFallback(e.message);
  process.exit(0);
}

// kamctl/kamcmd wrap the usrloc dump differently depending on version/RPC
// transport (e.g. top-level {AoRs:[...]}, or JSON-RPC {result:{Domains:[{Domain:{AoRs:[...]}}]}}).
// Rather than hardcode one path, recursively find every array whose entries
// look like an AoR record ({Info:{AoR,Contacts}} or {AoR,Contacts} directly),
// and merge them all — this is resilient to schema/wrapping differences.
function findAorArrays(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    const looksLikeAorArray =
      obj.length > 0 &&
      obj.every((item) => {
        const info = item && (item.Info || item.info || item);
        return info && typeof info === 'object' && (info.AoR || info.aor);
      });
    if (looksLikeAorArray) {
      out.push(obj);
      return; // don't descend further into a matched AoR array
    }
    obj.forEach((v) => findAorArrays(v, out));
    return;
  }
  for (const k of Object.keys(obj)) findAorArrays(obj[k], out);
}

const aorArrays = [];
findAorArrays(data, aorArrays);
const aors = aorArrays.length ? aorArrays.flat() : null;

if (!aors) {
  rawFallback('no AoR-shaped array found anywhere in the parsed JSON — unrecognized schema');
  process.exit(0);
}

console.log(`Total AoRs in usrloc: ${aors.length}`);

const allEntries = aors.map((entry) => {
  const info = entry.Info || entry.info || entry;
  const aor = info.AoR || info.aor || '';
  const rawContacts = info.Contacts || info.contacts || [];
  const contacts = rawContacts.map((c) => c.Contact || c.contact || c);
  return { aor, contacts };
});

const totalContacts = allEntries.reduce((sum, e) => sum + e.contacts.length, 0);
console.log(`Total contacts across all AoRs: ${totalContacts}`);

const matches = target
  ? allEntries.filter(
      (e) => e.aor.toLowerCase().includes(target.toLowerCase()) || e.contacts.some((c) => JSON.stringify(c).toLowerCase().includes(target.toLowerCase())),
    )
  : allEntries;

console.log(`\n=== Matches for target='${target || '(all)'}' : ${matches.length} AoR(s) ===`);

let matchedContactTotal = 0;
for (const m of matches) {
  console.log(`\nAoR: ${m.aor}`);
  console.log(`  Contact count: ${m.contacts.length}`);
  matchedContactTotal += m.contacts.length;
  m.contacts.forEach((c, i) => {
    console.log(`  [${i + 1}] Address:       ${c.Address || c.address || '(unknown)'}`);
    console.log(`      User-Agent:    ${c['User-Agent'] || c.user_agent || '(none reported)'}`);
    console.log(`      Call-ID:       ${c['Call-ID'] || c.call_id || '(unknown)'}`);
    console.log(`      Expires (s):   ${c.Expires ?? c.expires ?? '(unknown)'}`);
    console.log(`      Received:      ${c.Received ?? c.received ?? '(unknown)'}`);
    console.log(`      Socket:        ${c.Socket ?? c.socket ?? '(unknown)'}`);
    console.log(`      Last-Modified: ${c['Last-Modified'] ?? c.last_modified ?? '(unknown)'}`);
  });
}

console.log(`\n=== SUMMARY ===`);
console.log(`CONTACT_COUNT=${matchedContactTotal}`);
