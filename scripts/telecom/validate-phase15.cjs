#!/usr/bin/env node
/**
 * Phase 15 Enterprise Observability static validation.
 * Usage: node scripts/telecom/validate-phase15.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const OBS = path.join(API, 'modules', 'enterprise-observability');
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

mustExist(path.join(OBS, 'logging', 'telecom-structured-logger.service.ts'), 'structured logger');
mustExist(path.join(OBS, 'metrics', 'metrics.service.ts'), 'metrics service');
mustExist(path.join(OBS, 'metrics', 'metrics-registry.service.ts'), 'metrics registry');
mustExist(path.join(OBS, 'tracing', 'call-trace.service.ts'), 'call trace');
mustExist(path.join(OBS, 'health', 'enterprise-health.service.ts'), 'enterprise health');
mustExist(path.join(OBS, 'audit', 'enterprise-audit.service.ts'), 'enterprise audit');
mustExist(path.join(OBS, 'diagnostics', 'call-inspector.service.ts'), 'call inspector');
mustExist(path.join(OBS, 'dashboard', 'operations-dashboard.service.ts'), 'operations dashboard');
mustExist(path.join(OBS, 'events', 'observability-events.listener.ts'), 'observability listener');

const listener = fs.readFileSync(path.join(OBS, 'events', 'observability-events.listener.ts'), 'utf8');
if (!listener.includes('CALL_EVENTS.CREATED')) fail('call event observability hook missing');
else ok('call event hooks');
if (!listener.includes('QUEUE_EVENTS')) fail('queue observability hook missing');
else ok('queue event hooks');
if (!listener.includes('setImmediate') && !listener.includes('TelecomStructuredLoggerService')) {
  fail('async logging path missing');
} else ok('async structured logging');

const logger = fs.readFileSync(path.join(OBS, 'logging', 'telecom-structured-logger.service.ts'), 'utf8');
if (!logger.includes('setImmediate')) fail('non-blocking logger missing');
else ok('non-blocking logger');
if (!logger.includes('platformUuid')) fail('platformUuid in logs missing');
else ok('platformUuid in logs');

const trace = fs.readFileSync(path.join(OBS, 'metrics', 'metrics.service.ts'), 'utf8');
if (!trace.includes('vsp_active_calls')) fail('active calls metric missing');
else ok('call metrics');
if (!trace.includes('exportPrometheus')) fail('Prometheus export missing');
else ok('Prometheus export');

const metricsCtrl = fs.readFileSync(path.join(OBS, 'controllers', 'telecom-metrics.controller.ts'), 'utf8');
if (!metricsCtrl.includes("Get('metrics')")) fail('GET /telecom/metrics missing');
else ok('GET /telecom/metrics');

const obsCtrl = fs.readFileSync(path.join(OBS, 'controllers', 'observability.controller.ts'), 'utf8');
if (!obsCtrl.includes('dashboard')) fail('dashboard API missing');
else ok('dashboard API');
if (!obsCtrl.includes('diagnostics/calls')) fail('call inspector API missing');
else ok('call inspector API');
if (!obsCtrl.includes('audit')) fail('audit query API missing');
else ok('audit query API');

const healthCtrl = fs.readFileSync(path.join(API, 'app', 'health.controller.ts'), 'utf8');
if (!healthCtrl.includes('health/postgres')) fail('/health/postgres missing');
else ok('/health/postgres');
if (!healthCtrl.includes('health/kamailio')) fail('/health/kamailio missing');
else ok('/health/kamailio');
if (!healthCtrl.includes('health/rtpengine')) fail('/health/rtpengine missing');
else ok('/health/rtpengine');
if (!healthCtrl.includes('health/telnyx')) fail('/health/telnyx missing');
else ok('/health/telnyx');

const audit = fs.readFileSync(path.join(OBS, 'audit', 'enterprise-audit.service.ts'), 'utf8');
if (!audit.includes('immutable')) fail('immutable audit missing');
else ok('immutable audit');
if (!audit.includes('lpushUnbounded')) fail('append-only audit missing');
else ok('append-only audit');

const redis = fs.readFileSync(path.join(TEL, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('traceKey')) fail('trace Redis keys missing');
else ok('trace Redis keys');
if (!redis.includes('auditStreamKey')) fail('audit Redis keys missing');
else ok('audit Redis keys');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase15-enterprise-observability') &&
  !svc.includes('phase16-enterprise-security-hardening') &&
  !svc.includes('phase17-enterprise-ha') &&
  !svc.includes('phase18-production-platform') &&
  !svc.includes('phase19-enterprise-migration-toolkit') &&
  !svc.includes('phase20-production-cutover') &&
  !svc.includes('remediation-complete')
) {
  fail('telecom health mode not phase15+');
} else ok('telecom health mode phase15+');

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

const p14 = spawnSync('node', ['./scripts/telecom/validate-phase14.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p14.status !== 0) {
  console.error(p14.stdout || '');
  fail('phase 14 regression failed');
} else ok('phase 14 regression');

if (failed) {
  console.error('Phase 15 validation FAILED');
  process.exit(1);
}
console.log('Phase 15 validation PASSED');
