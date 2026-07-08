#!/usr/bin/env node
/**
 * Phase 11 Grandstream Provisioning static validation.
 * Usage: node scripts/telecom/validate-phase11.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const PROV = path.join(API, 'modules', 'provisioning');

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

mustExist(path.join(PROV, 'controllers', 'prov-edge.controller.ts'), 'prov edge controller');
mustExist(path.join(PROV, 'controllers', 'provisioning-admin.controller.ts'), 'prov admin controller');
mustExist(path.join(PROV, 'controllers', 'provisioning-internal.controller.ts'), 'prov internal controller');
mustExist(path.join(PROV, 'enrollment', 'device-enrollment.service.ts'), 'device enrollment');
mustExist(path.join(PROV, 'orchestrator', 'provisioning-orchestrator.service.ts'), 'orchestrator');
mustExist(path.join(PROV, 'generator', 'config-generator.service.ts'), 'config generator');
mustExist(path.join(PROV, 'templates', 'template-engine.service.ts'), 'template engine');
mustExist(path.join(PROV, 'vault', 'provisioning-vault.service.ts'), 'provisioning vault');
mustExist(path.join(PROV, 'firmware', 'firmware-catalog.service.ts'), 'firmware catalog');
mustExist(path.join(PROV, 'audit', 'provisioning-audit.service.ts'), 'audit service');
mustExist(path.join(API, 'prov', 'prov-edge.bootstrap.ts'), 'prov edge bootstrap');

const edge = fs.readFileSync(path.join(PROV, 'controllers', 'prov-edge.controller.ts'), 'utf8');
if (!edge.includes("'gs/:mac/cfg.xml'")) fail('ADR-042 cfg path missing');
else ok('GET /gs/{mac}/cfg.xml');
if (!edge.includes("'fw/:modelFamily/:version/:filename'")) fail('firmware path missing');
else ok('GET /fw/{modelFamily}/{version}/{filename}');
if (!edge.includes('ProvMacAuthGuard')) fail('MAC auth guard missing on cfg');
else ok('MAC auth guard');

const admin = fs.readFileSync(path.join(PROV, 'controllers', 'provisioning-admin.controller.ts'), 'utf8');
if (!admin.includes('devices/enroll')) fail('admin enroll missing');
else ok('POST /v1/provisioning/devices/enroll');
if (!admin.includes('reprovision')) fail('reprovision endpoint missing');
else ok('POST reprovision');
if (!admin.includes('rollback')) fail('rollback endpoint missing');
else ok('POST rollback');
if (!admin.includes('JwtAuthGuard')) fail('JWT on admin prov routes');
else ok('JWT-gated admin APIs');

const internal = fs.readFileSync(
  path.join(PROV, 'controllers', 'provisioning-internal.controller.ts'),
  'utf8',
);
if (!internal.includes("'render'")) fail('internal render missing');
else ok('POST /v1/internal/provisioning/render');
if (!internal.includes('TelecomServiceAuthGuard')) fail('service auth on internal render');
else ok('service-auth internal render');

const orch = fs.readFileSync(path.join(PROV, 'orchestrator', 'provisioning-orchestrator.service.ts'), 'utf8');
if (!orch.includes('quarantineUnknownMac')) fail('quarantine flow missing');
else ok('unknown MAC quarantine');
if (!orch.includes('rollback')) fail('rollback orchestration missing');
else ok('configuration rollback');
if (!orch.includes('provisioning.downloaded')) fail('download audit missing');
else ok('download audit events');

const vault = fs.readFileSync(path.join(API, 'modules', 'telecom', 'auth', 'sip-credential-vault.service.ts'), 'utf8');
if (!vault.includes('registerPersistentCredential')) fail('persistent desk SIP creds missing');
else ok('persistent desk SIP vault');

const enroll = fs.readFileSync(path.join(PROV, 'enrollment', 'device-enrollment.service.ts'), 'utf8');
if (!enroll.includes('deviceAssignment.create')) fail('DeviceAssignment integration missing');
else ok('DeviceAssignment on enroll');
if (!enroll.includes('sIPEndpoint.create')) fail('SIPEndpoint integration missing');
else ok('SIPEndpoint on enroll');

const gen = fs.readFileSync(path.join(PROV, 'generator', 'config-generator.service.ts'), 'utf8');
if (!gen.includes('computeArtifactHash')) fail('versioned artifact hash missing');
else ok('versioned artifact generation');

const kam = fs.readFileSync(path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg'), 'utf8');
if (!/rtpengine_offer\s*\(/.test(kam)) fail('Phase 9 media must remain intact');
else ok('Phase 9 media intact (Kamailio unchanged for Phase 11)');

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

const p10 = spawnSync('node', ['./scripts/telecom/validate-phase10.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p10.status !== 0) {
  console.error(p10.stdout || '');
  fail('phase 10 regression failed');
} else ok('phase 10 regression');

if (failed) {
  console.error('Phase 11 validation FAILED');
  process.exit(1);
}
console.log('Phase 11 validation PASSED');
