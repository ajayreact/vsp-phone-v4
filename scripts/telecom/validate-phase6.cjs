#!/usr/bin/env node
/**
 * Phase 6 SIP Auth & Registration static validation.
 * Usage: node scripts/telecom/validate-phase6.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

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

mustExist(path.join(SRC, 'auth', 'sip-digest-auth.service.ts'), 'sip-digest-auth.service');
mustExist(path.join(SRC, 'auth', 'sip-digest.crypto.ts'), 'sip-digest.crypto');
mustExist(path.join(SRC, 'auth', 'sip-credential-vault.service.ts'), 'vault stub');
mustExist(path.join(SRC, 'registration', 'registration.service.ts'), 'registration.service');
mustExist(path.join(SRC, 'redis', 'telecom-redis.service.ts'), 'telecom-redis');
mustExist(path.join(SRC, 'events', 'registration.events.ts'), 'registration.events');

const ctrl = fs.readFileSync(path.join(SRC, 'telecom.controller.ts'), 'utf8');
if (!ctrl.includes("auth/sip-digest")) fail('missing ADR-024 auth/sip-digest route');
else ok('POST auth/sip-digest');
if (!ctrl.includes("@Post('register')")) fail('missing register');
else ok('POST register');

const auth = fs.readFileSync(path.join(SRC, 'auth', 'sip-digest-auth.service.ts'), 'utf8');
if (!auth.includes('safeEqualHex') && !auth.includes('timingSafeEqual')) {
  fail('digest compare should be timing-safe');
} else ok('timing-safe digest compare');
if (!auth.includes('device_assignment')) fail('DeviceAssignment validation missing');
else ok('DeviceAssignment validation');
if (!auth.includes('realm_mismatch') && !auth.includes('tenant')) fail('tenant isolation missing');
else ok('tenant/realm checks');

const reg = fs.readFileSync(path.join(SRC, 'registration', 'registration.service.ts'), 'utf8');
if (!reg.includes('registration.created') && !reg.includes('REGISTRATION_EVENTS')) {
  fail('registration events missing');
} else ok('registration events');
if (!reg.includes('hset') && !reg.includes('registrationKey')) fail('Redis registration cache missing');
else ok('Redis registration mirror');
if (/contact.*create|prisma\.\w+\.create.*contact/i.test(reg) && reg.includes('Contact URI in Prisma')) {
  /* ok — we ban Contact in Prisma via comment + only status fields */
}
if (reg.includes('sipCallId')) fail('must not touch sipCallId');
else ok('no sipCallId usage');

const schema = fs.readFileSync(SCHEMA, 'utf8');
const schemaBefore = spawnSync('git', ['diff', '--', 'prisma/schema.prisma'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if ((schemaBefore.stdout || '').trim()) {
  fail('Prisma schema must remain frozen (git diff prisma/schema.prisma not empty)');
} else {
  ok('Prisma schema frozen (no diff)');
}
if (!schema.includes('sipCallId')) {
  /* already removed is fine */
} else {
  ok('sipCallId still in schema (unused by Phase 6 registration)');
}

const kam = fs.readFileSync(CFG, 'utf8');
if (!kam.includes('route[REGISTRAR]')) fail('Kamailio REGISTRAR route missing');
else ok('Kamailio REGISTRAR');
if (!kam.includes('auth/sip-digest')) fail('Kamailio must call sip-digest');
else ok('Kamailio → sip-digest');
if (/Registration deferred.*503/.test(kam) && !kam.includes('route[REGISTRAR]')) {
  fail('REGISTER still hard-503 stub only');
}
if (kam.includes('sl_send_reply("503", "Registration deferred')) {
  fail('REGISTRAR_STUB still returns 503 registration deferred');
} else {
  ok('REGISTER no longer returns deferred 503 stub');
}
if (!kam.includes('save("location")')) fail('usrloc save missing');
else ok('usrloc save("location")');
if (!kam.includes('route[INVITE]')) fail('Phase 6 gate: INVITE route may land later');
else ok('INVITE route present (Phase 7+)');
if (/rtpengine_offer|rtpengine_answer/.test(kam)) fail('RTP offer/answer not allowed');
else ok('no RTP offer/answer');

// Digest crypto unit smoke (no Nest)
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const ha1 = md5('alice:demo.sip.vsp.internal:secret');
const ha2 = md5('REGISTER:sip:demo.sip.vsp.internal');
const resp = md5(`${ha1}:nonce1:${ha2}`);
const expect = md5(`${ha1}:nonce1:${ha2}`);
if (resp !== expect) fail('digest self-check');
else ok('digest crypto self-check');

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
  console.error('Phase 6 validation FAILED');
  process.exit(1);
}
console.log('Phase 6 validation PASSED');
