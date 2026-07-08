#!/usr/bin/env node
/**
 * Phase 12 Recording Pipeline & Presence static validation.
 * Usage: node scripts/telecom/validate-phase12.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const REC = path.join(API, 'modules', 'recording');
const PRE = path.join(API, 'modules', 'presence');

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

mustExist(path.join(REC, 'lifecycle', 'recording-lifecycle.service.ts'), 'recording lifecycle');
mustExist(path.join(REC, 'policy', 'recording-policy.service.ts'), 'recording policy');
mustExist(path.join(REC, 'storage', 'object-storage.service.ts'), 'object storage');
mustExist(path.join(REC, 'upload', 'recording-upload.service.ts'), 'recording upload');
mustExist(path.join(REC, 'events', 'recording.events.ts'), 'recording events');
mustExist(path.join(PRE, 'presence.service.ts'), 'presence service');
mustExist(path.join(PRE, 'events', 'presence-events.listener.ts'), 'presence listener');
mustExist(path.join(PRE, 'controllers', 'presence.controller.ts'), 'presence API');

const lifecycle = fs.readFileSync(path.join(REC, 'lifecycle', 'recording-lifecycle.service.ts'), 'utf8');
if (!lifecycle.includes('recording.started') && !lifecycle.includes("RECORDING_EVENTS.STARTED")) {
  fail('recording.started event missing');
} else ok('recording.started event');
if (!lifecycle.includes('recording.completed') && !lifecycle.includes("RECORDING_EVENTS.COMPLETED")) {
  fail('recording.completed event missing');
} else ok('recording.completed event');
if (!lifecycle.includes('prisma.recording.create')) fail('Recording metadata persistence missing');
else ok('Recording metadata in Prisma');
if (!lifecycle.includes('mediaObjectKey')) fail('mediaObjectKey persistence missing');
else ok('mediaObjectKey on complete');

const storage = fs.readFileSync(path.join(REC, 'storage', 'object-storage.service.ts'), 'utf8');
if (!storage.includes('@aws-sdk/client-s3')) fail('S3/MinIO client missing');
else ok('MinIO/S3 integration');
if (!storage.includes('recordings/')) fail('ADR-029 object key layout missing');
else ok('ADR-029 object key layout');

const policy = fs.readFileSync(path.join(REC, 'policy', 'recording-policy.service.ts'), 'utf8');
if (!policy.includes('recordingPolicy')) fail('RecordingPolicy lookup missing');
else ok('RecordingPolicy evaluation');

const routing = fs.readFileSync(path.join(API, 'modules', 'telecom', 'routing', 'routing.service.ts'), 'utf8');
if (!routing.includes('recordingPolicy.evaluateRouteRecording')) fail('Route Plan recording flags missing');
else ok('Route Plan recording from policy');

const telecomCtrl = fs.readFileSync(path.join(API, 'modules', 'telecom', 'telecom.controller.ts'), 'utf8');
if (!telecomCtrl.includes('recording/lifecycle')) fail('POST recording/lifecycle missing');
else ok('POST /recording/lifecycle');
if (!telecomCtrl.includes('recording/intent')) fail('POST recording/intent missing');
else ok('POST /recording/intent');

const presence = fs.readFileSync(path.join(PRE, 'presence.service.ts'), 'utf8');
if (!presence.includes('presence.changed') && !presence.includes('PRESENCE_EVENTS.CHANGED')) {
  fail('presence.changed event missing');
} else ok('presence.changed event');
if (!presence.includes('presenceLineKey')) fail('Redis presence line key missing');
else ok('Redis presence cache');

const listener = fs.readFileSync(path.join(PRE, 'events', 'presence-events.listener.ts'), 'utf8');
if (!listener.includes('REGISTRATION_EVENTS.CREATED')) fail('registration → presence hook missing');
else ok('registration → presence');
if (!listener.includes('CALL_EVENTS.ANSWERED')) fail('call answered → presence hook missing');
else ok('call answered → ON_CALL');
if (!listener.includes('CALL_EVENTS.ENDED')) fail('call ended → presence hook missing');
else ok('call ended → restore');

const redis = fs.readFileSync(path.join(API, 'modules', 'telecom', 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('recordingActiveKey')) fail('recording Redis keys missing');
else ok('recording Redis correlation');
if (!redis.includes('presenceLineKey')) fail('presence Redis helpers missing');
else ok('presence Redis helpers');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!pkg.dependencies?.['@aws-sdk/client-s3']) fail('@aws-sdk/client-s3 dependency missing');
else ok('@aws-sdk/client-s3 dependency');

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

const p11 = spawnSync('node', ['./scripts/telecom/validate-phase11.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p11.status !== 0) {
  console.error(p11.stdout || '');
  fail('phase 11 regression failed');
} else ok('phase 11 regression');

if (failed) {
  console.error('Phase 12 validation FAILED');
  process.exit(1);
}
console.log('Phase 12 validation PASSED');
