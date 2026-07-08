#!/usr/bin/env node
/**
 * Phase 13 Enterprise Call Applications static validation.
 * Usage: node scripts/telecom/validate-phase13.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const QUE = path.join(API, 'modules', 'queue');
const IVR = path.join(API, 'modules', 'ivr');
const CONF = path.join(API, 'modules', 'conference');
const VM = path.join(API, 'modules', 'voicemail');
const MEDIA = path.join(API, 'modules', 'call-media');
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

mustExist(path.join(QUE, 'runtime', 'queue-runtime.service.ts'), 'queue runtime');
mustExist(path.join(QUE, 'runtime', 'queue-agent-selection.service.ts'), 'queue agent selection');
mustExist(path.join(QUE, 'events', 'queue.events.ts'), 'queue events');
mustExist(path.join(IVR, 'runtime', 'ivr-runtime.service.ts'), 'IVR runtime');
mustExist(path.join(IVR, 'events', 'ivr.events.ts'), 'IVR events');
mustExist(path.join(CONF, 'runtime', 'conference-runtime.service.ts'), 'conference runtime');
mustExist(path.join(CONF, 'events', 'conference.events.ts'), 'conference events');
mustExist(path.join(VM, 'runtime', 'voicemail-runtime.service.ts'), 'voicemail runtime');
mustExist(path.join(MEDIA, 'music-on-hold.service.ts'), 'music on hold');
mustExist(path.join(MEDIA, 'prompt-management.service.ts'), 'prompt management');
mustExist(path.join(TEL, 'routing', 'routing-continue.service.ts'), 'routing continue');
mustExist(path.join(TEL, 'routing', 'call-apps-resolver.service.ts'), 'call apps resolver');

const queueRt = fs.readFileSync(path.join(QUE, 'runtime', 'queue-runtime.service.ts'), 'utf8');
if (!queueRt.includes('APP_MEDIA')) fail('queue APP_MEDIA action missing');
else ok('queue APP_MEDIA');
if (!queueRt.includes('queue.entered') && !queueRt.includes('QUEUE_EVENTS.ENTERED')) {
  fail('queue.entered event missing');
} else ok('queue.entered event');
if (!queueRt.includes('queue.overflow') && !queueRt.includes('QUEUE_EVENTS.OVERFLOW')) {
  fail('queue overflow missing');
} else ok('queue overflow');
if (!queueRt.includes('queue.timeout') && !queueRt.includes('QUEUE_EVENTS.TIMEOUT')) {
  fail('queue timeout missing');
} else ok('queue timeout');
if (!queueRt.includes('platformUuid')) fail('queue platformUuid correlation missing');
else ok('queue platformUuid correlation');

const ivrRt = fs.readFileSync(path.join(IVR, 'runtime', 'ivr-runtime.service.ts'), 'utf8');
if (!ivrRt.includes('IvrDestinationType.QUEUE')) fail('IVR → Queue routing missing');
else ok('IVR → Queue');
if (!ivrRt.includes('IvrDestinationType.CONFERENCE')) fail('IVR → Conference routing missing');
else ok('IVR → Conference');
if (!ivrRt.includes('IvrDestinationType.VOICEMAIL')) fail('IVR → Voicemail routing missing');
else ok('IVR → Voicemail');
if (!ivrRt.includes('ivr.digit') && !ivrRt.includes('IVR_EVENTS.DIGIT')) {
  fail('ivr.digit event missing');
} else ok('ivr.digit event');

const confRt = fs.readFileSync(path.join(CONF, 'runtime', 'conference-runtime.service.ts'), 'utf8');
if (!confRt.includes('conference.joined') && !confRt.includes('CONFERENCE_EVENTS.JOINED')) {
  fail('conference.joined missing');
} else ok('conference.joined');
if (!confRt.includes('conference.left') && !confRt.includes('CONFERENCE_EVENTS.LEFT')) {
  fail('conference.leave missing');
} else ok('conference leave');
if (
  !confRt.includes('conference.recording_hook') &&
  !confRt.includes('CONFERENCE_EVENTS.RECORDING_HOOK')
) {
  fail('conference recording hook missing');
} else ok('conference recording hook');
if (!confRt.includes('startFromPolicy')) fail('conference recording lifecycle hook missing');
else ok('conference recording lifecycle');

const routing = fs.readFileSync(path.join(TEL, 'routing', 'routing.service.ts'), 'utf8');
if (!routing.includes('resolveAppDestination')) fail('internal dial → call apps missing');
else ok('internal dial → call apps');
if (!routing.includes('resolveDnisToApp')) fail('inbound DNIS overlay missing');
else ok('inbound DNIS overlay');

const ctrl = fs.readFileSync(path.join(TEL, 'telecom.controller.ts'), 'utf8');
if (!ctrl.includes('routing/continue')) fail('POST routing/continue missing');
else ok('POST /routing/continue');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase13-enterprise-call-apps') &&
  !svc.includes('phase14-enterprise-operations') &&
  !svc.includes('phase15-enterprise-observability') &&
  !svc.includes('phase16-enterprise-security-hardening') &&
  !svc.includes('phase17-enterprise-ha') &&
  !svc.includes('phase18-production-platform') &&
  !svc.includes('phase19-enterprise-migration-toolkit') &&
  !svc.includes('phase20-production-cutover') &&
  !svc.includes('remediation-complete')
) {
  fail('telecom health mode not phase13+');
} else ok('telecom health mode');

const redis = fs.readFileSync(path.join(TEL, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('queueSessionKey')) fail('queue Redis keys missing');
else ok('queue Redis keys');
if (!redis.includes('ivrSessionKey')) fail('IVR Redis keys missing');
else ok('IVR Redis keys');
if (!redis.includes('conferenceLiveKey')) fail('conference Redis keys missing');
else ok('conference Redis keys');
if (!redis.includes('dnisRouteKey')) fail('DNIS overlay Redis key missing');
else ok('DNIS overlay Redis key');

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

const p12 = spawnSync('node', ['./scripts/telecom/validate-phase12.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p12.status !== 0) {
  console.error(p12.stdout || '');
  fail('phase 12 regression failed');
} else ok('phase 12 regression');

if (failed) {
  console.error('Phase 13 validation FAILED');
  process.exit(1);
}
console.log('Phase 13 validation PASSED');
