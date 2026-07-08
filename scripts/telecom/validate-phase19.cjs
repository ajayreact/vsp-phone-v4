#!/usr/bin/env node
/**
 * Phase 19 Enterprise Migration Toolkit static validation.
 * Usage: node scripts/telecom/validate-phase19.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const MIG = path.join(API, 'modules', 'migration-toolkit');
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

mustExist(path.join(MIG, 'validation', 'migration-validation.service.ts'), 'migration validation');
mustExist(path.join(MIG, 'import', 'migration-import.service.ts'), 'migration import');
mustExist(path.join(MIG, 'export', 'migration-export.service.ts'), 'migration export');
mustExist(path.join(MIG, 'mapping', 'mapping-engine.service.ts'), 'mapping engine');
mustExist(path.join(MIG, 'verification', 'migration-verification.service.ts'), 'migration verification');
mustExist(path.join(MIG, 'rollback', 'rollback-metadata.service.ts'), 'rollback metadata');
mustExist(path.join(MIG, 'reports', 'migration-report.service.ts'), 'migration reports');
mustExist(path.join(MIG, 'services', 'migration-orchestrator.service.ts'), 'migration orchestrator');
mustExist(path.join(MIG, 'services', 'migration-safety.service.ts'), 'migration safety');
mustExist(path.join(MIG, 'guards', 'super-admin.guard.ts'), 'super admin guard');
mustExist(path.join(MIG, 'controllers', 'migration.controller.ts'), 'migration controller');

const migCtrl = fs.readFileSync(path.join(MIG, 'controllers', 'migration.controller.ts'), 'utf8');
if (!migCtrl.includes("Get('validate')")) fail('GET /migration/validate missing');
else ok('GET /migration/validate');
if (!migCtrl.includes("Post('dry-run')")) fail('POST /migration/dry-run missing');
else ok('POST /migration/dry-run');
if (!migCtrl.includes("Post('import')")) fail('POST /migration/import missing');
else ok('POST /migration/import');
if (!migCtrl.includes('SuperAdminGuard')) fail('Super Admin guard missing');
else ok('Super Admin guard');

const validator = fs.readFileSync(path.join(MIG, 'validation', 'migration-validation.service.ts'), 'utf8');
if (!validator.includes('detectDuplicates')) fail('duplicate detection missing');
else ok('duplicate detection');
if (!validator.includes('detectOrphans')) fail('orphan detection missing');
else ok('orphan detection');

const importer = fs.readFileSync(path.join(MIG, 'import', 'migration-import.service.ts'), 'utf8');
if (!importer.includes('dryRun')) fail('dry-run support missing');
else ok('dry-run support');
if (!importer.includes('importLock')) fail('duplicate import prevention missing');
else ok('duplicate import prevention');

const safety = fs.readFileSync(path.join(MIG, 'services', 'migration-safety.service.ts'), 'utf8');
if (!safety.includes('DeploymentReadinessService')) fail('readiness gate missing');
else ok('readiness gate');

const orchestrator = fs.readFileSync(path.join(MIG, 'services', 'migration-orchestrator.service.ts'), 'utf8');
if (!orchestrator.includes('SecurityAuditService')) fail('audit integration missing');
else ok('audit integration');
if (!orchestrator.includes('TelecomStructuredLoggerService')) fail('observability integration missing');
else ok('observability integration');

const reports = fs.readFileSync(path.join(MIG, 'reports', 'migration-report.service.ts'), 'utf8');
if (!reports.includes('exportCsv')) fail('CSV export missing');
else ok('CSV export');

const appMod = fs.readFileSync(path.join(API, 'app', 'app.module.ts'), 'utf8');
if (!appMod.includes('MigrationToolkitModule')) fail('MigrationToolkitModule not imported');
else ok('MigrationToolkitModule wired');

const healthCtrl = fs.readFileSync(path.join(API, 'app', 'health.controller.ts'), 'utf8');
if (!healthCtrl.includes('phase19-enterprise-migration-toolkit') && !healthCtrl.includes('phase20-production-cutover') && !healthCtrl.includes('remediation-complete')) fail('health mode not phase19/20');
else ok('health mode phase19/20');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (!svc.includes('phase19-enterprise-migration-toolkit') && !svc.includes('phase20-production-cutover') && !svc.includes('remediation-complete')) fail('telecom health mode not phase19/20');
else ok('telecom health mode phase19/20');

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

const p18 = spawnSync('node', ['./scripts/telecom/validate-phase18.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p18.status !== 0) {
  console.error(p18.stdout || '');
  fail('phase 18 regression failed');
} else ok('phase 18 regression');

if (failed) {
  console.error('Phase 19 validation FAILED');
  process.exit(1);
}
console.log('Phase 19 validation PASSED');
