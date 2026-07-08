#!/usr/bin/env node
/**
 * Engineering Remediation Sprint — static validation.
 * Usage: npm run telecom:validate:remediation
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const KAM = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const AUDIT = path.join(ROOT, 'docs', '11-final-audit');

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

function mustInclude(text, needles, label) {
  for (const n of needles) {
    if (!text.includes(n)) fail(`${label} missing "${n}"`);
    else ok(`${label} has ${n}`);
  }
}

console.log('=== Remediation Sprint Validation ===\n');

// --- Frozen architecture ---
const schemaDiff = spawnSync('git', ['diff', '--', 'prisma/schema.prisma'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if ((schemaDiff.stdout || '').trim()) fail('Prisma schema must stay frozen');
else ok('Prisma schema frozen');

const migDir = path.join(ROOT, 'prisma', 'migrations');
if (fs.existsSync(migDir)) {
  const migDiff = spawnSync('git', ['diff', '--', 'prisma/migrations'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if ((migDiff.stdout || '').trim()) fail('Database migrations must stay frozen');
  else ok('Database migrations frozen');
}

const rtpconf = fs.readFileSync(path.join(ROOT, 'infrastructure', 'rtpengine', 'rtpengine.conf'), 'utf8');
if (!/Phase 4/.test(rtpconf) && !/Phase 9/.test(rtpconf)) fail('rtpengine architecture must remain');
else ok('RTPengine architecture preserved');

// --- C-01 Service auth ---
const kam = fs.readFileSync(KAM, 'utf8');
mustInclude(kam, ['route[NESTJS_HTTP_HDRS]', 'X-VSP-Service-Auth', '__VSP_SERVICE_AUTH_TOKEN__'], 'Kamailio C-01');
mustExist(path.join(ROOT, 'infrastructure', 'docker', 'kamailio', 'docker-entrypoint.sh'), 'Kamailio entrypoint');

const entrypoint = fs.readFileSync(
  path.join(ROOT, 'infrastructure', 'docker', 'kamailio', 'docker-entrypoint.sh'),
  'utf8',
);
mustInclude(entrypoint, ['TELECOM_SERVICE_AUTH_TOKEN', 'KAMAILIO_REQUIRE_SERVICE_AUTH'], 'entrypoint C-01');

const prodValidator = fs.readFileSync(
  path.join(API, 'modules', 'production-platform', 'configuration', 'production-config-validator.service.ts'),
  'utf8',
);
mustInclude(prodValidator, ['KamailioPersistenceService', 'SECURITY_ENFORCE_TELECOM'], 'production config C-01/H-04');

// --- C-02 Backup orchestration ---
mustExist(
  path.join(API, 'modules', 'enterprise-ha', 'backup', 'backup-orchestration.service.ts'),
  'BackupOrchestrationService',
);
const haCtrl = fs.readFileSync(path.join(API, 'modules', 'enterprise-ha', 'controllers', 'ha.controller.ts'), 'utf8');
mustInclude(haCtrl, ["Get('backup/status')", "Post('backup/execute')", 'BackupOrchestrationService'], 'HA backup C-02');

// --- H-01 / H-02 Kamailio media + continue ---
mustInclude(kam, ['route[APP_MEDIA_RELAY]', 'route[ROUTING_CONTINUE]', '/routing/continue'], 'Kamailio H-01/H-02');

// --- H-03 RBAC ---
for (const ctrl of [
  'modules/provisioning/controllers/provisioning-admin.controller.ts',
  'modules/recording/controllers/recording-admin.controller.ts',
  'modules/presence/controllers/presence.controller.ts',
]) {
  const text = fs.readFileSync(path.join(API, ctrl), 'utf8');
  if (!text.includes('PermissionsGuard') || !text.includes('@RequirePermission')) {
    fail(`${ctrl} missing PermissionsGuard / @RequirePermission`);
  } else ok(`${path.basename(ctrl)} RBAC`);
}

mustExist(path.join(API, 'modules', 'enterprise-security', 'auth', 'permissions.constants.ts'), 'permissions constants');

// --- H-04 Telecom security default ---
const envVal = fs.readFileSync(path.join(API, 'app', 'env.validation.ts'), 'utf8');
if (!envVal.includes("vsp === 'production'") || !envVal.includes('SECURITY_ENFORCE_TELECOM')) {
  fail('SECURITY_ENFORCE_TELECOM production default missing');
} else ok('SECURITY_ENFORCE_TELECOM production default');

// --- H-05 Migration production import ---
mustExist(
  path.join(API, 'modules', 'migration-toolkit', 'import', 'migration-database-import.service.ts'),
  'MigrationDatabaseImportService',
);
const migImport = fs.readFileSync(
  path.join(API, 'modules', 'migration-toolkit', 'import', 'migration-import.service.ts'),
  'utf8',
);
mustInclude(migImport, ['productionImport', 'MigrationDatabaseImportService'], 'migration H-05');

// --- H-06 Kamailio persistence ---
mustInclude(kam, ['__USRLOC_DB_MODE__', '__USRLOC_DB_URL_LINE__'], 'Kamailio H-06 placeholders');
mustExist(path.join(ROOT, 'infrastructure', 'kamailio', 'usrloc-schema.sql'), 'usrloc schema');
mustExist(
  path.join(API, 'modules', 'enterprise-ha', 'backup', 'kamailio-persistence.service.ts'),
  'KamailioPersistenceService',
);

// --- P3 medium ---
mustExist(path.join(API, 'common', 'health', 'tcp-probe.ts'), 'shared tcp-probe');
const haHealth = fs.readFileSync(path.join(API, 'modules', 'enterprise-ha', 'health', 'ha-health.service.ts'), 'utf8');
mustInclude(haHealth, ['READINESS_STRICT', 'listNodes'], 'READINESS_STRICT cluster gate');

const shutdown = fs.readFileSync(
  path.join(API, 'modules', 'enterprise-ha', 'services', 'shutdown-coordinator.service.ts'),
  'utf8',
);
mustInclude(shutdown, ['gracefulShutdown.flush'], 'shutdown flush');

const healthCtrl = fs.readFileSync(path.join(API, 'app', 'health.controller.ts'), 'utf8');
mustInclude(healthCtrl, ['enterpriseHealth.checkAll()', 'remediation-complete'], 'app-aware readiness');

const restoreVal = fs.readFileSync(
  path.join(API, 'modules', 'production-platform', 'restore', 'restore-validation.service.ts'),
  'utf8',
);
mustInclude(restoreVal, ['knownPhases', 'remediation-complete'], 'restore validation M-07');

const mainTs = fs.readFileSync(path.join(API, 'main.ts'), 'utf8');
if (!mainTs.includes('1.0.0-remediation')) fail('Swagger version not updated');
else ok('Swagger version updated');

// --- Documentation ---
for (const doc of [
  'REMEDIATION_REPORT.md',
  'FINDINGS_MATRIX.md',
  'PRODUCTION_APPROVAL.md',
  'FINAL_DEPLOYMENT_CHECKLIST.md',
]) {
  mustExist(path.join(AUDIT, doc), doc);
}

// --- Build + lint + phase20 regression ---
console.log('\nBuilding api...');
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

console.log('Running phase20 regression...');
const p20 = spawnSync('node', ['./scripts/telecom/validate-phase20.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p20.status !== 0) {
  console.error(p20.stdout || '');
  fail('phase20 regression failed');
} else ok('phase20 regression');

if (failed) {
  console.error('\nRemediation validation FAILED');
  process.exit(1);
}
console.log('\nRemediation validation PASSED');
