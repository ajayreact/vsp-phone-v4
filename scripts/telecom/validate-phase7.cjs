#!/usr/bin/env node
/**
 * Phase 7 Route Resolution & CallSession static validation.
 * Usage: node scripts/telecom/validate-phase7.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'apps', 'api', 'src', 'modules', 'telecom');
const CFG = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');

let failed = 0;
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  failed = 1;
};

function mustExist(p, label) {
  if (!fs.existsSync(p)) fail(`missing ${label}`);
  else ok(label);
}

mustExist(path.join(SRC, 'routing', 'routing.service.ts'), 'routing.service');
mustExist(path.join(SRC, 'events', 'call.events.ts'), 'call.events');
mustExist(path.join(SRC, 'events', 'call-events.listener.ts'), 'call-events.listener');

const routing = fs.readFileSync(path.join(SRC, 'routing', 'routing.service.ts'), 'utf8');
if (!routing.includes('callSession.create')) fail('CallSession create missing');
else ok('CallSession create');
const createMatch = routing.match(
  /await this\.prisma\.callSession\.create\(\{([\s\S]*?)\n    \}\);/,
);
if (!createMatch) {
  fail('could not locate CallSession.create block');
} else if (/\bsipCallId\s*:/.test(createMatch[1])) {
  fail('must not write sipCallId on CallSession.create');
} else {
  ok('no sipCallId on CallSession.create');
}
if (!routing.includes('never set sipCallId')) {
  fail('ADR-019 sipCallId ban comment missing near create');
} else ok('ADR-019 sipCallId ban documented');
if (!routing.includes('corrSipKey')) fail('Redis SIP corr missing');
else ok('Redis SIP corr (sip Call-ID not in Prisma)');
if (!routing.includes('platformUuid')) fail('platformUuid missing');
else ok('platformUuid allocation');
if (!routing.includes('FORK')) fail('FORK actions missing');
else ok('FORK multi-device');
if (!routing.includes('BUSY') || !routing.includes('486')) fail('busy handling missing');
else ok('busy → 486');
if (!routing.includes('NO_REGISTERED_DEVICES')) fail('no-devices handling missing');
else ok('no registered devices');
if (!routing.includes('corrSipKey') || !routing.includes('callRuntimeKey')) {
  fail('Redis corr/runtime missing');
} else ok('Redis corr + runtime cache');
if (!routing.includes('inboundEnabled') || !routing.includes('outboundEnabled')) {
  fail('CallPolicy checks missing');
} else ok('CallPolicy validation');
if (!routing.includes('callerId')) fail('CallerID handling missing');
else ok('CallerID fields');
if (!routing.includes('PSTN_NOT_ENABLED')) fail('PSTN fail-closed missing');
else ok('PSTN/Telnyx fail-closed');

const ctrl = fs.readFileSync(path.join(SRC, 'telecom.controller.ts'), 'utf8');
if (!ctrl.includes('routing/resolve')) fail('ADR-024 routing/resolve route missing');
else ok('POST routing/resolve');

const schemaDiff = spawnSync('git', ['diff', '--', 'prisma/schema.prisma'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if ((schemaDiff.stdout || '').trim()) fail('Prisma schema must stay frozen');
else ok('Prisma schema frozen');

const kam = fs.readFileSync(CFG, 'utf8');
if (!kam.includes('route[INVITE]')) fail('Kamailio INVITE route missing');
else ok('Kamailio route[INVITE]');
if (!kam.includes('routing/resolve')) fail('Kamailio must call routing/resolve');
else ok('Kamailio → routing/resolve');
if (!kam.includes('X-VSP-Platform-UUID')) fail('platformUuid header missing');
else ok('X-VSP-Platform-UUID injection');
if (!kam.includes('append_branch') && !kam.includes('lookup("location")')) {
  fail('fork/lookup missing');
} else ok('fork / usrloc lookup');
if (kam.includes('Service Unavailable - VSP Kamailio Phase 3 foundation')) {
  fail('INVITE still using Phase 3 foundation 503 stub');
} else ok('INVITE no longer Phase 3 foundation stub');
if (!kam.includes('route[REGISTRAR]') || !kam.includes('auth/sip-digest')) {
  fail('REGISTER path must remain intact');
} else ok('REGISTER path intact');
if (/rtpengine_offer|rtpengine_answer/.test(kam)) {
  if (!/Phase 9/.test(kam)) fail('RTP offer/answer not allowed in Phase 7 snapshot');
  else ok('Phase 9 media supersedes Phase 7 no-RTP gate');
} else ok('no RTP offer/answer (Phase 7 snapshot)');

console.log('Building api...');
const build = spawnSync('npx', ['nx', 'build', 'api'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});
if (build.status !== 0) {
  console.error(build.stdout || '');
  console.error(build.stderr || '');
  fail('nx build api failed');
} else ok('nx build api');

// Update kamailio phase3 gate expectations if still referenced
const kamVal = spawnSync('node', ['./scripts/kamailio/validate-phase3.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (kamVal.status !== 0) {
  console.error(kamVal.stdout || '');
  console.error(kamVal.stderr || '');
  fail('kamailio validate failed (update gate for INVITE)');
} else ok('kamailio validate');

if (failed) {
  console.error('Phase 7 validation FAILED');
  process.exit(1);
}
console.log('Phase 7 validation PASSED');
