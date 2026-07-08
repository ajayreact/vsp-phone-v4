#!/usr/bin/env node
/**
 * Phase 9 RTPengine Media Integration static validation.
 * Usage: node scripts/telecom/validate-phase9.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'apps', 'api', 'src', 'modules', 'telecom');
const CFG = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const RTPCONF = path.join(ROOT, 'infrastructure', 'rtpengine', 'rtpengine.conf');
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

mustExist(path.join(SRC, 'media', 'media-lifecycle.service.ts'), 'media-lifecycle.service');
mustExist(CFG, 'kamailio.cfg');
mustExist(RTPCONF, 'rtpengine.conf');

const kam = fs.readFileSync(CFG, 'utf8');
if (!/Phase 9/.test(kam)) fail('Kamailio must declare Phase 9 media');
else ok('Kamailio Phase 9 banner');
if (!/rtpengine_offer\s*\(/.test(kam)) fail('rtpengine_offer() missing');
else ok('rtpengine_offer() wired');
if (!/rtpengine_answer\s*\(/.test(kam)) fail('rtpengine_answer() missing');
else ok('rtpengine_answer() wired');
if (!/rtpengine_delete\s*\(/.test(kam)) fail('rtpengine_delete() missing');
else ok('rtpengine_delete() wired');
if (!kam.includes('route[RTPENGINE_OFFER]')) fail('RTPENGINE_OFFER route missing');
else ok('route[RTPENGINE_OFFER]');
if (!kam.includes('onreply_route[MANAGE_REPLY]')) fail('MANAGE_REPLY onreply route missing');
else ok('onreply_route[MANAGE_REPLY]');
if (!kam.includes('media/lifecycle')) fail('Kamailio → media/lifecycle corr missing');
else ok('Kamailio media/lifecycle HTTP corr');
if (!kam.includes('extra_id_pv')) fail('rtpengine extra_id_pv (platformUuid label) missing');
else ok('platformUuid via extra_id_pv');
if (!kam.includes('ICE=force') || !kam.includes('DTLS=passive')) {
  fail('WebRTC ICE/DTLS flags missing');
} else ok('WebRTC ICE relay + DTLS passive flags');
if (!kam.includes('SDES=on')) fail('SRTP SDES flag missing');
else ok('SRTP SDES=on for internal SIP');
if (!kam.includes('rtpe_puuid')) fail('htable rtpe_puuid correlation missing');
else ok('htable platformUuid by Call-ID');
if (!kam.includes('route[INVITE]') || !kam.includes('routing/resolve')) {
  fail('Phase 7/8 INVITE path must remain intact');
} else ok('INVITE routing intact');
if (!kam.includes('route[REGISTRAR]') || !kam.includes('auth/sip-digest')) {
  fail('REGISTER path must remain intact');
} else ok('REGISTER intact');
if (!kam.includes('BRIDGE_CARRIER')) fail('Phase 8 BRIDGE_CARRIER must remain');
else ok('BRIDGE_CARRIER intact');

const media = fs.readFileSync(path.join(SRC, 'media', 'media-lifecycle.service.ts'), 'utf8');
if (!media.includes('corrRtpKey')) fail('corrRtpKey usage missing');
else ok('Redis corr:rtp writes');
if (/prisma\.\w+\.(create|update|upsert)/i.test(media)) {
  fail('must not persist media via Prisma writes');
} else ok('no media Prisma writes');

const redis = fs.readFileSync(path.join(SRC, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('corrRtpKey')) fail('corrRtpKey helper missing');
else ok('corrRtpKey helper');

const ctrl = fs.readFileSync(path.join(SRC, 'telecom.controller.ts'), 'utf8');
if (!ctrl.includes('media/lifecycle')) fail('POST media/lifecycle route missing');
else ok('POST /media/lifecycle');

const svc = fs.readFileSync(path.join(SRC, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase9-rtpengine-media') &&
  !svc.includes('phase10-webrtc-browser') &&
  !svc.includes('phase12-recording-presence') &&
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
  fail('telecom health mode not updated for phase 9/10/12');
} else ok('telecom health mode');

const schemaDiff = spawnSync('git', ['diff', '--', 'prisma/schema.prisma'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if ((schemaDiff.stdout || '').trim()) fail('Prisma schema must stay frozen');
else ok('Prisma schema frozen');

const conf = fs.readFileSync(RTPCONF, 'utf8');
if (!conf.includes('Phase 9')) fail('rtpengine.conf Phase 9 banner missing');
else ok('rtpengine.conf Phase 9');

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

const rtpVal = spawnSync('node', ['./scripts/rtpengine/validate-phase4.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (rtpVal.status !== 0) {
  console.error(rtpVal.stdout || '');
  console.error(rtpVal.stderr || '');
  fail('rtpengine validate failed');
} else ok('rtpengine validate (phase4 gate updated)');

const kamVal = spawnSync('node', ['./scripts/kamailio/validate-phase3.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (kamVal.status !== 0) {
  console.error(kamVal.stdout || '');
  console.error(kamVal.stderr || '');
  fail('kamailio validate failed');
} else ok('kamailio validate');

if (failed) {
  console.error('Phase 9 validation FAILED');
  process.exit(1);
}
console.log('Phase 9 validation PASSED');
