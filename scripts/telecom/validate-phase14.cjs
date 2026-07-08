#!/usr/bin/env node
/**
 * Phase 14 Enterprise Operations static validation.
 * Usage: node scripts/telecom/validate-phase14.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const OPS = path.join(API, 'modules', 'enterprise-ops');
const TEL = path.join(API, 'modules', 'telecom');

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

mustExist(path.join(OPS, 'runtime', 'blf-subscription.service.ts'), 'BLF subscription');
mustExist(path.join(OPS, 'runtime', 'blf-notify.service.ts'), 'BLF notify');
mustExist(path.join(OPS, 'runtime', 'sla-appearance.service.ts'), 'SLA appearance');
mustExist(path.join(OPS, 'runtime', 'park-runtime.service.ts'), 'call park');
mustExist(path.join(OPS, 'runtime', 'pickup-runtime.service.ts'), 'call pickup');
mustExist(path.join(OPS, 'runtime', 'ring-group.service.ts'), 'ring group');
mustExist(path.join(OPS, 'runtime', 'hunt-group.service.ts'), 'hunt group');
mustExist(path.join(OPS, 'runtime', 'paging-runtime.service.ts'), 'paging');
mustExist(path.join(OPS, 'runtime', 'intercom-runtime.service.ts'), 'intercom');
mustExist(path.join(OPS, 'runtime', 'supervisor-monitor.service.ts'), 'supervisor monitor');
mustExist(path.join(OPS, 'runtime', 'device-state-sync.service.ts'), 'device state sync');

const blf = fs.readFileSync(path.join(OPS, 'runtime', 'blf-subscription.service.ts'), 'utf8');
if (!blf.includes('BLF_EVENTS') && !blf.includes('blf.lamp_changed')) fail('BLF events missing');
else ok('BLF events');
if (!blf.includes('blfWatchersKey')) fail('BLF watcher index missing');
else ok('BLF watcher index');

const park = fs.readFileSync(path.join(OPS, 'runtime', 'park-runtime.service.ts'), 'utf8');
if (!park.includes('CallLifecycleState.PARK')) fail('park state missing');
else ok('park CallSession state');
if (!park.includes('parkSlotKey')) fail('park slot Redis missing');
else ok('park slot Redis');

const pickup = fs.readFileSync(path.join(OPS, 'runtime', 'pickup-runtime.service.ts'), 'utf8');
if (!pickup.includes('directedPickup') || !pickup.includes('groupPickup')) fail('pickup modes missing');
else ok('directed + group pickup');

const hunt = fs.readFileSync(path.join(OPS, 'runtime', 'hunt-group.service.ts'), 'utf8');
if (!hunt.includes('ROUND_ROBIN')) fail('round robin hunt missing');
else ok('round robin hunt');
if (!hunt.includes('LONGEST_IDLE')) fail('longest idle hunt missing');
else ok('longest idle hunt');

const supervisor = fs.readFileSync(path.join(OPS, 'runtime', 'supervisor-monitor.service.ts'), 'utf8');
if (!supervisor.includes('monitor') || !supervisor.includes('whisper') || !supervisor.includes('barge')) {
  fail('supervisor modes missing');
} else ok('monitor/whisper/barge');

const routing = fs.readFileSync(path.join(TEL, 'routing', 'routing.service.ts'), 'utf8');
if (!routing.includes('enterpriseOps.resolveFeature')) fail('enterprise ops routing hook missing');
else ok('enterprise ops resolve hook');
if (!routing.includes('expandSlaFork')) fail('SLA fork expansion missing');
else ok('SLA fork expansion');

const continueSvc = fs.readFileSync(path.join(TEL, 'routing', 'routing-continue.service.ts'), 'utf8');
if (!continueSvc.includes('park_call')) fail('park_call continue missing');
else ok('park_call continue');
if (!continueSvc.includes('supervisor_')) fail('supervisor continue missing');
else ok('supervisor continue');

const ctrl = fs.readFileSync(path.join(TEL, 'telecom.controller.ts'), 'utf8');
if (!ctrl.includes('blf/subscribe')) fail('POST blf/subscribe missing');
else ok('POST /blf/subscribe');
if (!ctrl.includes('presence/subscribe')) fail('POST presence/subscribe missing');
else ok('POST /presence/subscribe');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase14-enterprise-operations') &&
  !svc.includes('phase15-enterprise-observability') &&
  !svc.includes('phase16-enterprise-security-hardening') &&
  !svc.includes('phase17-enterprise-ha') &&
  !svc.includes('phase18-production-platform') &&
  !svc.includes('phase19-enterprise-migration-toolkit') &&
  !svc.includes('phase20-production-cutover') &&
  !svc.includes('remediation-complete')
) {
  fail('telecom health mode not phase14+');
} else ok('telecom health mode');

const redis = fs.readFileSync(path.join(TEL, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('parkSlotKey')) fail('park Redis keys missing');
else ok('park Redis keys');
if (!redis.includes('blfSubsKey')) fail('BLF Redis keys missing');
else ok('BLF Redis keys');
if (!redis.includes('supervisorSessionKey')) fail('supervisor Redis keys missing');
else ok('supervisor Redis keys');

const presence = fs.readFileSync(path.join(API, 'modules', 'presence', 'presence.service.ts'), 'utf8');
if (!presence.includes('presenceDeviceIndexKey')) fail('device index maintenance missing');
else ok('presence device index');

const kam = fs.readFileSync(path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg'), 'utf8');
if (!/rtpengine_offer\s*\(/.test(kam)) fail('Phase 9 media must remain intact');
else ok('Kamailio SIP signaling unchanged');

const schemaDiff = spawnSync('git', ['diff', '--', 'prisma/schema.prisma'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if ((schemaDiff.stdout || '').trim()) fail('Prisma schema must stay frozen');
else ok('Prisma schema frozen');

console.log('Building api...');
const buildApi = spawnSync('npx', ['nx', 'build', 'api'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});
if (buildApi.status !== 0) {
  console.error(buildApi.stdout || '');
  console.error(buildApi.stderr || '');
  fail('nx build api failed');
} else ok('nx build api');

const p13 = spawnSync('node', ['./scripts/telecom/validate-phase13.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p13.status !== 0) {
  console.error(p13.stdout || '');
  fail('phase 13 regression failed');
} else ok('phase 13 regression');

if (failed) {
  console.error('Phase 14 validation FAILED');
  process.exit(1);
}
console.log('Phase 14 validation PASSED');
