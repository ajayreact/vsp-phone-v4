#!/usr/bin/env node
'use strict';

/**
 * Reconstruct a SIP ladder + pass/fail milestone check from a merged
 * capture produced by scripts/platform/capture-call-flow.sh.
 *
 * Usage:
 *   node scripts/platform/build-sip-ladder.cjs <merged.log> [callid-substring]
 *
 * If no callid-substring is given, auto-picks the callid with the most
 * total lines across [KAM]/[API]/[RTP] (best guess at "the test call").
 */

const fs = require('node:fs');

const file = process.argv[2];
const callidFilter = process.argv[3] || null;

if (!file) {
  console.error('Usage: node build-sip-ladder.cjs <merged.log> [callid-substring]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const lines = raw.split('\n').filter(Boolean);

// [SRC] <docker-ts> <kamailio-or-nest content...>
const LINE_RE = /^\[(KAM|API|RTP)\]\s+(\S+)\s+(.*)$/;
const CALLID_RE = /callid=([^\s@}]+@[^\s}]+|[^\s@}]+)/;
const CTX_CALLID_RE = /\{1\s+\d+\s+\S+\s+([^@\s}]+@[^\s}]+)\}/;
// API (NestJS) JSON logs use "callId":"..." (camelCase, quoted) instead of Kamailio's callid=
const JSON_CALLID_RE = /"callId"\s*:\s*"([^"]+)"/;

function extractCallId(content) {
  const ctx = CTX_CALLID_RE.exec(content);
  if (ctx) return ctx[1];
  const m = CALLID_RE.exec(content);
  if (m) return m[1];
  const j = JSON_CALLID_RE.exec(content);
  if (j) return j[1];
  return null;
}

const parsed = [];
const countsByCallId = new Map();

for (const raw of lines) {
  const m = LINE_RE.exec(raw);
  if (!m) continue;
  const [, src, ts, content] = m;
  const callid = extractCallId(content);
  parsed.push({ src, ts, content, callid });
  if (callid) countsByCallId.set(callid, (countsByCallId.get(callid) || 0) + 1);
}

let targetCallId = callidFilter;
if (!targetCallId) {
  let best = null;
  let bestCount = -1;
  for (const [cid, count] of countsByCallId) {
    if (count > bestCount) {
      best = cid;
      bestCount = count;
    }
  }
  targetCallId = best;
  console.log(`No callid given — auto-selected highest-volume callid: ${targetCallId} (${bestCount} lines)\n`);
}

// Match on extracted callid OR a raw substring hit (covers API lines that
// only carry Kamailio's derived X-Request-Id "kam-inv-<callid>"/"kam-<callid>"
// rather than a callId field, e.g. telecom.route.caller_lookup).
const relevant = targetCallId
  ? parsed.filter((p) => (p.callid && p.callid.includes(targetCallId)) || p.content.includes(targetCallId))
  : parsed;

if (!relevant.length) {
  console.log('No lines matched — check the callid substring or the capture window.');
  process.exit(0);
}

console.log(`=== Ladder for callid~="${targetCallId}" (${relevant.length} lines) ===\n`);
for (const r of relevant) {
  console.log(`${r.ts}  [${r.src}]  ${r.content}`);
}

// --- Milestone detection ---
const has = (re) => relevant.some((r) => re.test(r.content));
const find = (re) => relevant.find((r) => re.test(r.content));

const milestones = [
  { name: 'REGISTER received (Kamailio)', re: /REGISTER aor=/, owner: 'Kamailio' },
  { name: 'INVITE received (Kamailio)', re: /INVITE r-uri=/, owner: 'Kamailio' },
  { name: 'Kamailio -> API routing.resolve call', re: /RC1 nestjs http path=\/api\/v1\/telecom\/routing\/resolve|telecom\.route\.resolve\.dto_in/, owner: 'Kamailio/API' },
  { name: 'API caller lookup resolved', re: /telecom\.route\.caller_lookup".*"resolved":true/, owner: 'API RoutingService' },
  { name: 'API returned REJECT', re: /"type"\s*:\s*"REJECT"|INVITE rejected by NestJS/, owner: 'API RoutingService', isFailureSignal: true },
  { name: 'API returned BRIDGE_CARRIER', re: /"type"\s*:\s*"BRIDGE_CARRIER"|telecom\.route\.resolve\.outbound/, owner: 'API RoutingService' },
  { name: '100 Trying', re: /\b100\b.*Trying|SIP\/2\.0 100/, owner: 'Kamailio/Carrier' },
  { name: '180 Ringing', re: /\b180\b.*Ringing|SIP\/2\.0 180/, owner: 'Kamailio/Carrier' },
  { name: '200 OK (answer)', re: /SIP\/2\.0 200|200 OK/, owner: 'Kamailio/Carrier' },
  { name: 'ACK', re: /\bACK\b/, owner: 'Device/Kamailio' },
  { name: 'RTPengine offer/answer', re: /rtpengine|RTPENGINE/i, owner: 'RTPengine' },
  { name: 'BYE', re: /\bBYE\b/, owner: 'Device/Carrier' },
];

console.log(`\n=== Milestone checklist ===`);
const failures = [];
for (const ms of milestones) {
  const hit = find(ms.re);
  const pass = Boolean(hit) && !ms.isFailureSignal;
  const flag = ms.isFailureSignal ? (hit ? '⚠️ ' : '  ') : hit ? '✅' : '❌';
  console.log(`${flag} ${ms.name}${hit ? ` (${hit.ts} [${hit.src}])` : ''}`);
  if (!hit && !ms.isFailureSignal) failures.push(ms);
}

console.log(`\n=== First failing stage (best guess from evidence) ===`);
if (find(/"type"\s*:\s*"REJECT"|INVITE rejected by NestJS/)) {
  const rejLine = find(/"type"\s*:\s*"REJECT"|INVITE rejected by NestJS/);
  console.log(`API RoutingService rejected the call: ${rejLine.content}`);
  console.log('Responsible component: API (RoutingService) — see reject reason/code in the line above.');
} else if (!find(/INVITE r-uri=/)) {
  console.log('No INVITE ever reached Kamailio for this callid — check Device/Kamailio ingress (NAT, firewall, wrong registrar).');
  console.log('Responsible component: Client or network path to Kamailio.');
} else if (!find(/RC1 nestjs http path=\/api\/v1\/telecom\/routing\/resolve|telecom\.route\.resolve\.dto_in/)) {
  console.log('Kamailio received the INVITE but never called API /routing/resolve — check kamailio.cfg NESTJS_HTTP_POST / http_client config.');
  console.log('Responsible component: Kamailio.');
} else if (!find(/SIP\/2\.0 100|100 Trying/)) {
  console.log('API resolved routing but no 100 Trying was ever sent — check Kamailio relay to carrier / dispatcher.');
  console.log('Responsible component: Kamailio or Carrier (Telnyx) reachability.');
} else if (!find(/SIP\/2\.0 200|200 OK/)) {
  console.log('Trying/Ringing seen but never a 200 OK — check carrier side (Telnyx CDR) or remote party never answered.');
  console.log('Responsible component: Carrier (Telnyx) or remote party — cross-check Telnyx Call Control Detail Record.');
} else if (!find(/rtpengine|RTPENGINE/i)) {
  console.log('Call answered (200 OK) but no RTPengine activity logged — audio path likely broken.');
  console.log('Responsible component: RTPengine or NAT (check rtpengine offer/answer + media relay counters).');
} else {
  console.log('All checked milestones present — no obvious failing stage from this capture. Confirm audio subjectively and check BYE/hangup cause.');
}

console.log(`\n=== Mermaid sequence diagram (paste into docs) ===`);
console.log('```mermaid');
console.log('sequenceDiagram');
console.log('    participant D as Device');
console.log('    participant K as Kamailio');
console.log('    participant A as API/RoutingService');
console.log('    participant C as Carrier (Telnyx)');
const seen = new Set();
const arrow = (from, to, label, key) => {
  if (seen.has(key)) return;
  seen.add(key);
  console.log(`    ${from}->>${to}: ${label}`);
};
if (find(/REGISTER aor=/)) arrow('D', 'K', 'REGISTER', 'reg');
if (find(/INVITE r-uri=/)) arrow('D', 'K', 'INVITE', 'inv');
if (find(/RC1 nestjs http path=\/api\/v1\/telecom\/routing\/resolve|telecom\.route\.resolve\.dto_in/)) arrow('K', 'A', 'POST /routing/resolve', 'resolve');
if (find(/"type"\s*:\s*"REJECT"|INVITE rejected by NestJS/)) arrow('A', 'K', 'REJECT (see reason)', 'reject');
if (find(/"type"\s*:\s*"BRIDGE_CARRIER"/)) {
  arrow('A', 'K', 'BRIDGE_CARRIER', 'bridge');
  arrow('K', 'C', 'INVITE', 'inv2');
}
if (find(/100 Trying|SIP\/2\.0 100/)) arrow('C', 'K', '100 Trying', '100');
if (find(/180.*Ringing|SIP\/2\.0 180/)) arrow('C', 'K', '180 Ringing', '180');
if (find(/SIP\/2\.0 200|200 OK/)) {
  arrow('C', 'K', '200 OK', '200a');
  arrow('K', 'D', '200 OK', '200b');
}
if (find(/\bACK\b/)) arrow('D', 'K', 'ACK', 'ack');
if (find(/\bBYE\b/)) arrow('D', 'K', 'BYE', 'bye');
console.log('```');
