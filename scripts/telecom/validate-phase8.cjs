#!/usr/bin/env node
/**
 * Phase 8 Telnyx Carrier Integration static validation.
 * Usage: node scripts/telecom/validate-phase8.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const CARRIER = path.join(ROOT, 'apps', 'api', 'src', 'modules', 'carrier');
const ROUTING = path.join(
  ROOT,
  'apps',
  'api',
  'src',
  'modules',
  'telecom',
  'routing',
  'routing.service.ts',
);
const CFG = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const DISP = path.join(ROOT, 'infrastructure', 'kamailio', 'dispatcher.list');
const PERM = path.join(ROOT, 'infrastructure', 'kamailio', 'permissions.address');

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

mustExist(path.join(CARRIER, 'telnyx.carrier-adapter.ts'), 'Telnyx adapter');
mustExist(path.join(CARRIER, 'carrier.service.ts'), 'CarrierService');
mustExist(path.join(CARRIER, 'carrier.controller.ts'), 'CarrierController');
mustExist(path.join(CARRIER, 'carrier-adapter.interface.ts'), 'Adapter interface');

const routing = fs.readFileSync(ROUTING, 'utf8');
if (routing.includes('PSTN_NOT_ENABLED')) fail('PSTN still fail-closed');
else ok('PSTN fail-closed lifted');
if (!routing.includes('resolveOutbound') || !routing.includes('resolveInbound')) {
  fail('PSTN resolve methods missing');
} else ok('outbound + inbound resolve');
if (!routing.includes('BRIDGE_CARRIER')) fail('BRIDGE_CARRIER missing');
else ok('BRIDGE_CARRIER');
if (!routing.includes('OUTBOUND_PSTN') || !routing.includes('INBOUND_PSTN')) {
  fail('PSTN CallType missing');
} else ok('CallType OUTBOUND/INBOUND_PSTN');
if (!routing.includes('selectOutboundTrunk')) fail('adapter trunk select missing');
else ok('Carrier adapter selectOutboundTrunk');
if (!routing.includes('lookupDid') && !routing.includes('validateCli')) {
  fail('DID/CLI helpers missing');
} else ok('DID + CLI validation');
if (/callSession\.create[\s\S]{0,400}sipCallId\s*:/.test(routing)) {
  fail('sipCallId write detected');
} else ok('no sipCallId Prisma writes');

const ctrl = fs.readFileSync(path.join(CARRIER, 'carrier.controller.ts'), 'utf8');
if (!ctrl.includes('webhooks/telnyx')) fail('Telnyx webhook route missing');
else ok('POST webhooks/telnyx');
if (!ctrl.includes('carrier/health')) fail('carrier health missing');
else ok('GET carrier/health');
if (!ctrl.includes('failover')) fail('failover hook missing');
else ok('POST carrier/failover');

const redis = fs.readFileSync(
  path.join(ROOT, 'apps/api/src/modules/telecom/redis/telecom-redis.service.ts'),
  'utf8',
);
if (!redis.includes('corrTelnyxCallKey')) fail('Telnyx Redis corr missing');
else ok('Telnyx Redis correlation keys');

const schemaDiff = spawnSync('git', ['diff', '--', 'prisma/schema.prisma'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if ((schemaDiff.stdout || '').trim()) fail('Prisma schema must stay frozen');
else ok('Prisma schema frozen');

const kam = fs.readFileSync(CFG, 'utf8');
if (!kam.includes('BRIDGE_CARRIER') || !kam.includes('ds_select_dst')) {
  fail('Kamailio Telnyx dispatcher branch missing');
} else ok('Kamailio BRIDGE_CARRIER + dispatcher');
if (!kam.includes('allow_source_address("2")')) fail('Telnyx IP ACL missing');
else ok('Telnyx IP ACL group 2');
if (!kam.includes('intentHint') || !kam.includes('INBOUND')) {
  fail('Kamailio intentHint/INBOUND missing');
} else ok('Kamailio intentHint for PSTN');
if (/rtpengine_offer\s*\(|rtpengine_answer\s*\(/.test(kam)) {
  if (!/Phase 9/.test(kam)) fail('RTP offer/answer not allowed in Phase 8 snapshot');
  else ok('Phase 9 media supersedes Phase 8 stub gate');
} else ok('media still stubbed (Phase 8 snapshot)');
if (!kam.includes('route[REGISTRAR]') || !kam.includes('auth/sip-digest')) {
  fail('REGISTER must remain intact');
} else ok('REGISTER intact');

const disp = fs.readFileSync(DISP, 'utf8');
if (!disp.includes('sip.telnyx.com') || disp.includes('state=disabled')) {
  fail('dispatcher Telnyx must be active');
} else ok('dispatcher Telnyx active');

const perm = fs.readFileSync(PERM, 'utf8');
if (!/^2\s/m.test(perm)) fail('permissions group 2 Telnyx missing');
else ok('permissions Telnyx group 2');

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

if (failed) {
  console.error('Phase 8 validation FAILED');
  process.exit(1);
}
console.log('Phase 8 validation PASSED');
