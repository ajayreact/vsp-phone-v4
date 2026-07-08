#!/usr/bin/env node
/**
 * Phase 18 Production Platform static validation.
 * Usage: node scripts/telecom/validate-phase18.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const PROD = path.join(API, 'modules', 'production-platform');
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

mustExist(path.join(PROD, 'configuration', 'production-config-validator.service.ts'), 'production config validator');
mustExist(path.join(PROD, 'configuration', 'config-export.service.ts'), 'config export');
mustExist(path.join(PROD, 'deployment', 'deployment-readiness.service.ts'), 'deployment readiness');
mustExist(path.join(PROD, 'deployment', 'cicd-readiness.service.ts'), 'cicd readiness');
mustExist(path.join(PROD, 'environment', 'environment-profile.service.ts'), 'environment profile');
mustExist(path.join(PROD, 'backups', 'backup-readiness.service.ts'), 'backup readiness');
mustExist(path.join(PROD, 'restore', 'restore-validation.service.ts'), 'restore validation');
mustExist(path.join(PROD, 'releases', 'release-info.service.ts'), 'release info');
mustExist(path.join(PROD, 'validation', 'startup-validation.service.ts'), 'startup validation');
mustExist(path.join(PROD, 'readiness', 'production-readiness.service.ts'), 'production readiness');
mustExist(path.join(PROD, 'controllers', 'production.controller.ts'), 'production controller');

const prodCtrl = fs.readFileSync(path.join(PROD, 'controllers', 'production.controller.ts'), 'utf8');
if (!prodCtrl.includes("Get('readiness')")) fail('GET /production/readiness missing');
else ok('GET /production/readiness');
if (!prodCtrl.includes("Get('version')")) fail('GET /production/version missing');
else ok('GET /production/version');
if (!prodCtrl.includes('ConfigExportService')) fail('config export wired');
else ok('config export wired');

const validator = fs.readFileSync(
  path.join(PROD, 'configuration', 'production-config-validator.service.ts'),
  'utf8',
);
if (!validator.includes('onModuleInit')) fail('startup validation missing');
else ok('startup validation');
if (!validator.includes('probePostgres')) fail('postgres startup probe missing');
else ok('postgres startup probe');

const configExport = fs.readFileSync(
  path.join(PROD, 'configuration', 'config-export.service.ts'),
  'utf8',
);
if (!configExport.includes('secretsExcluded')) fail('secrets exclusion missing');
else ok('secrets exclusion');

const appMod = fs.readFileSync(path.join(API, 'app', 'app.module.ts'), 'utf8');
if (!appMod.includes('ProductionPlatformModule')) fail('ProductionPlatformModule not imported');
else ok('ProductionPlatformModule wired');

const healthCtrl = fs.readFileSync(path.join(API, 'app', 'health.controller.ts'), 'utf8');
if (
  !healthCtrl.includes('phase18-production-platform') &&
  !healthCtrl.includes('phase19-enterprise-migration-toolkit') &&
  !healthCtrl.includes('phase20-production-cutover') &&
  !healthCtrl.includes('remediation-complete')
) {
  fail('health mode not phase18+');
} else ok('health mode phase18+');

const envVal = fs.readFileSync(path.join(API, 'app', 'env.validation.ts'), 'utf8');
if (!envVal.includes('RELEASE_NUMBER')) fail('RELEASE_NUMBER env missing');
else ok('RELEASE_NUMBER env');
if (!envVal.includes('BACKUP_SCHEDULE')) fail('BACKUP_SCHEDULE env missing');
else ok('BACKUP_SCHEDULE env');

const redis = fs.readFileSync(path.join(TEL, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('scanKeys')) fail('redis scanKeys for export missing');
else ok('redis scanKeys');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase18-production-platform') &&
  !svc.includes('phase19-enterprise-migration-toolkit') &&
  !svc.includes('phase20-production-cutover') &&
  !svc.includes('remediation-complete')
) {
  fail('telecom health mode not phase18+');
} else ok('telecom health mode phase18+');

const kam = fs.readFileSync(path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg'), 'utf8');
if (!/rtpengine_offer\s*\(/.test(kam)) fail('Kamailio must remain unchanged');
else ok('Kamailio unchanged');

const rtpconf = fs.readFileSync(path.join(ROOT, 'infrastructure', 'rtpengine', 'rtpengine.conf'), 'utf8');
if (!/Phase 4/.test(rtpconf) && !/Phase 9/.test(rtpconf)) fail('rtpengine.conf must remain');
else ok('rtpengine.conf unchanged');

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

console.log('Running lint...');
const lint = spawnSync('npx', ['nx', 'lint', 'api'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (lint.status !== 0) {
  console.error(lint.stdout || '');
  console.error(lint.stderr || '');
  fail('nx lint api failed');
} else ok('nx lint api');

const p17 = spawnSync('node', ['./scripts/telecom/validate-phase17.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p17.status !== 0) {
  console.error(p17.stdout || '');
  fail('phase 17 regression failed');
} else ok('phase 17 regression');

if (failed) {
  console.error('Phase 18 validation FAILED');
  process.exit(1);
}
console.log('Phase 18 validation PASSED');
