#!/usr/bin/env node
/**
 * Phase 10 WebRTC Browser Client static validation.
 * Usage: node scripts/telecom/validate-phase10.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const ADMIN = path.join(ROOT, 'apps', 'admin', 'src');
const CFG = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const PKG = path.join(ROOT, 'package.json');

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

mustExist(path.join(API, 'modules', 'auth', 'auth.controller.ts'), 'auth.controller');
mustExist(path.join(API, 'modules', 'telecom', 'webrtc', 'webrtc-enroll.service.ts'), 'webrtc-enroll');
mustExist(path.join(API, 'modules', 'telecom', 'webrtc', 'webrtc.controller.ts'), 'webrtc.controller');
mustExist(path.join(ADMIN, 'lib', 'softphone', 'sip-softphone.ts'), 'sip-softphone client');
mustExist(path.join(ADMIN, 'app', 'softphone', 'page.tsx'), 'softphone page');

const authCtrl = fs.readFileSync(path.join(API, 'modules', 'auth', 'auth.controller.ts'), 'utf8');
if (!authCtrl.includes("'login'") && !authCtrl.includes('login')) fail('POST auth/login missing');
else ok('POST /v1/auth/login');

const webrtcCtrl = fs.readFileSync(path.join(API, 'modules', 'telecom', 'webrtc', 'webrtc.controller.ts'), 'utf8');
if (!webrtcCtrl.includes("'enroll'") || !webrtcCtrl.includes('enrollWebRtc')) fail('POST webrtc/enroll missing');
else ok('POST /webrtc/enroll');
if (!webrtcCtrl.includes('enroll/revoke')) fail('POST enroll/revoke missing');
else ok('POST /webrtc/enroll/revoke');
if (!webrtcCtrl.includes('JwtAuthGuard')) fail('JWT guard on webrtc routes');
else ok('JWT-gated enroll');

const enroll = fs.readFileSync(
  path.join(API, 'modules', 'telecom', 'webrtc', 'webrtc-enroll.service.ts'),
  'utf8',
);
if (!enroll.includes('registerEnrollCredential')) fail('vault enroll creds missing');
else ok('temporary SIP credentials via vault');
if (!enroll.includes('iceServers')) fail('ICE servers in enroll response');
else ok('ICE servers in enroll');
if (!enroll.includes('wssUrl')) fail('wssUrl in enroll');
else ok('wssUrl in enroll');

const vault = fs.readFileSync(
  path.join(API, 'modules', 'telecom', 'auth', 'sip-credential-vault.service.ts'),
  'utf8',
);
if (!vault.includes('registerEnrollCredential')) fail('vault enroll register missing');
else ok('vault enroll register/revoke');

const sipClient = fs.readFileSync(path.join(ADMIN, 'lib', 'softphone', 'sip-softphone.ts'), 'utf8');
if (!sipClient.includes('sip.js')) fail('SIP.js import missing');
else ok('SIP.js integration');
if (!sipClient.includes('Registerer')) fail('SIP REGISTER missing');
else ok('SIP REGISTER');
if (!sipClient.includes('Inviter')) fail('SIP INVITE missing');
else ok('SIP INVITE');
if (!sipClient.includes('.bye()')) fail('SIP BYE missing');
else ok('SIP BYE');
if (!sipClient.includes('toggleHold') || !sipClient.includes('toggleMute')) {
  fail('hold/mute missing');
} else ok('hold + mute');
if (!sipClient.includes('setMicrophone') || !sipClient.includes('setSpeaker')) {
  fail('device switching missing');
} else ok('mic/speaker switching');
if (!sipClient.includes('reconnect')) fail('reconnect missing');
else ok('WSS reconnect');

const kam = fs.readFileSync(CFG, 'utf8');
if (!/Phase 10/.test(kam)) fail('Kamailio Phase 10 banner');
else ok('Kamailio Phase 10');
if (!kam.includes('add_path')) fail('WSS add_path missing (ADR-039)');
else ok('WSS add_path');
if (!kam.includes('remove_hf("X-VSP-Platform-UUID")')) fail('strip X-VSP from browser');
else ok('strip untrusted X-VSP headers');
if (!/rtpengine_offer\s*\(/.test(kam)) fail('Phase 9 media must remain intact');
else ok('Phase 9 media intact');

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
if (!pkg.dependencies?.['sip.js']) fail('sip.js dependency missing');
else ok('sip.js in package.json');

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

console.log('Building admin...');
const buildAdmin = spawnSync('npx', ['nx', 'build', 'admin'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});
if (buildAdmin.status !== 0) {
  console.error(buildAdmin.stdout || '');
  console.error(buildAdmin.stderr || '');
  fail('nx build admin failed');
} else ok('nx build admin');

const p9 = spawnSync('node', ['./scripts/telecom/validate-phase9.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p9.status !== 0) {
  console.error(p9.stdout || '');
  fail('phase 9 regression failed');
} else ok('phase 9 regression');

if (failed) {
  console.error('Phase 10 validation FAILED');
  process.exit(1);
}
console.log('Phase 10 validation PASSED');
