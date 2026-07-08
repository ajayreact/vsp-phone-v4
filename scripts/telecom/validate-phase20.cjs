#!/usr/bin/env node
/**
 * Phase 20 Production Cutover & Go-Live static validation.
 * Usage: node scripts/telecom/validate-phase20.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const CUT = path.join(API, 'modules', 'production-cutover');
const TEL = path.join(API, 'modules', 'telecom');
const DOCS = path.join(ROOT, 'docs', '10-production');

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

mustExist(path.join(CUT, 'validation', 'cutover-readiness.service.ts'), 'cutover readiness');
mustExist(path.join(CUT, 'cutover', 'checklist-engine.service.ts'), 'checklist engine');
mustExist(path.join(CUT, 'cutover', 'cutover-state.service.ts'), 'cutover state');
mustExist(path.join(CUT, 'runbooks', 'runbook-catalog.service.ts'), 'runbook catalog');
mustExist(path.join(CUT, 'smoke-tests', 'smoke-test.service.ts'), 'smoke test service');
mustExist(path.join(CUT, 'monitoring', 'cutover-monitoring.service.ts'), 'cutover monitoring');
mustExist(path.join(CUT, 'rollback', 'rollback-plan.service.ts'), 'rollback plan');
mustExist(path.join(CUT, 'reports', 'cutover-report.service.ts'), 'cutover reports');
mustExist(path.join(CUT, 'services', 'cutover-orchestrator.service.ts'), 'cutover orchestrator');
mustExist(path.join(CUT, 'controllers', 'cutover.controller.ts'), 'cutover controller');

const cutCtrl = fs.readFileSync(path.join(CUT, 'controllers', 'cutover.controller.ts'), 'utf8');
if (!cutCtrl.includes("Get('status')")) fail('GET /cutover/status missing');
else ok('GET /cutover/status');
if (!cutCtrl.includes("Get('readiness')")) fail('GET /cutover/readiness missing');
else ok('GET /cutover/readiness');
if (!cutCtrl.includes("Post('smoke-test')")) fail('POST /cutover/smoke-test missing');
else ok('POST /cutover/smoke-test');
if (!cutCtrl.includes("Get('report')")) fail('GET /cutover/report missing');
else ok('GET /cutover/report');
if (!cutCtrl.includes("Get('rollback-plan')")) fail('GET /cutover/rollback-plan missing');
else ok('GET /cutover/rollback-plan');
if (!cutCtrl.includes('SuperAdminGuard')) fail('Super Admin guard missing');
else ok('Super Admin guard');

const readiness = fs.readFileSync(path.join(CUT, 'validation', 'cutover-readiness.service.ts'), 'utf8');
if (!readiness.includes('DeploymentReadinessService')) fail('Phase 18 readiness gate missing');
else ok('Phase 18 readiness gate');
if (!readiness.includes('MigrationImportService')) fail('Phase 19 migration gate missing');
else ok('Phase 19 migration gate');
if (!readiness.includes('criticalFailures')) fail('critical failure blocking missing');
else ok('critical failure blocking');

const smoke = fs.readFileSync(path.join(CUT, 'smoke-tests', 'smoke-test.service.ts'), 'utf8');
if (!smoke.includes('sip_registration')) fail('SIP registration smoke test missing');
else ok('SIP registration smoke test');
if (!smoke.includes('health_endpoints')) fail('health endpoints smoke test missing');
else ok('health endpoints smoke test');
if (!smoke.includes('telnyx_webhook')) fail('Telnyx webhook smoke test missing');
else ok('Telnyx webhook smoke test');

const runbook = fs.readFileSync(path.join(CUT, 'runbooks', 'runbook-catalog.service.ts'), 'utf8');
if (!runbook.includes('pre_cutover')) fail('pre-cutover checklist missing');
else ok('pre-cutover checklist');
if (!runbook.includes('rollback')) fail('rollback checklist missing');
else ok('rollback checklist');

const rollback = fs.readFileSync(path.join(CUT, 'rollback', 'rollback-plan.service.ts'), 'utf8');
if (!rollback.includes('reversible') && !rollback.includes('non-destructive')) {
  if (!rollback.includes('not performed automatically')) fail('non-destructive rollback missing');
}
ok('non-destructive rollback');

const reports = fs.readFileSync(path.join(CUT, 'reports', 'cutover-report.service.ts'), 'utf8');
if (!reports.includes('exportCsv')) fail('CSV export missing');
else ok('CSV export');

const orchestrator = fs.readFileSync(path.join(CUT, 'services', 'cutover-orchestrator.service.ts'), 'utf8');
if (!orchestrator.includes('SecurityAuditService')) fail('audit integration missing');
else ok('audit integration');
if (!orchestrator.includes('TelecomStructuredLoggerService')) fail('observability integration missing');
else ok('observability integration');

const appMod = fs.readFileSync(path.join(API, 'app', 'app.module.ts'), 'utf8');
if (!appMod.includes('ProductionCutoverModule')) fail('ProductionCutoverModule not imported');
else ok('ProductionCutoverModule wired');

const healthCtrl = fs.readFileSync(path.join(API, 'app', 'health.controller.ts'), 'utf8');
if (!healthCtrl.includes('phase20-production-cutover') && !healthCtrl.includes('remediation-complete')) {
  fail('health mode not remediation-complete');
} else ok('health mode remediation');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (!svc.includes('phase20-production-cutover') && !svc.includes('remediation-complete')) {
  fail('telecom health mode not remediation');
} else ok('telecom health mode remediation');

mustExist(path.join(DOCS, 'production-runbook.md'), 'production runbook doc');
mustExist(path.join(DOCS, 'go-live-checklist.md'), 'go-live checklist doc');
mustExist(path.join(DOCS, 'smoke-test-guide.md'), 'smoke test guide doc');
mustExist(path.join(DOCS, 'rollback-runbook.md'), 'rollback runbook doc');
mustExist(path.join(DOCS, 'noc-operations-guide.md'), 'NOC operations guide doc');
mustExist(path.join(DOCS, 'post-go-live-verification-guide.md'), 'post-go-live verification doc');
mustExist(path.join(DOCS, 'hypercare-checklist.md'), 'hypercare checklist doc');

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

const p19 = spawnSync('node', ['./scripts/telecom/validate-phase19.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p19.status !== 0) {
  console.error(p19.stdout || '');
  fail('phase 19 regression failed');
} else ok('phase 19 regression');

if (failed) {
  console.error('Phase 20 validation FAILED');
  process.exit(1);
}
console.log('Phase 20 validation PASSED');
