#!/usr/bin/env node
/**
 * Phase 17 Enterprise High Availability static validation.
 * Usage: node scripts/telecom/validate-phase17.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const HA = path.join(API, 'modules', 'enterprise-ha');
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

mustExist(path.join(API, 'common', 'redis', 'redis-connection.factory.ts'), 'redis connection factory');
mustExist(path.join(HA, 'redis', 'redis-ha.service.ts'), 'redis ha service');
mustExist(path.join(HA, 'replication', 'postgres-ha.service.ts'), 'postgres ha service');
mustExist(path.join(HA, 'failover', 'kamailio-node-registry.service.ts'), 'kamailio node registry');
mustExist(path.join(HA, 'failover', 'rtpengine-node-registry.service.ts'), 'rtpengine node registry');
mustExist(path.join(HA, 'failover', 'failure-recovery.service.ts'), 'failure recovery');
mustExist(path.join(HA, 'loadbalancing', 'load-balancer.middleware.ts'), 'load balancer middleware');
mustExist(path.join(HA, 'services', 'shutdown-coordinator.service.ts'), 'shutdown coordinator');
mustExist(path.join(HA, 'services', 'scalability-readiness.service.ts'), 'scalability readiness');
mustExist(path.join(HA, 'services', 'backup-dr.service.ts'), 'backup dr service');
mustExist(path.join(HA, 'sessions', 'stateless-runtime.service.ts'), 'stateless runtime');
mustExist(path.join(HA, 'controllers', 'ha.controller.ts'), 'ha controller');

const redisSvc = fs.readFileSync(path.join(TEL, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redisSvc.includes('createRedisClient')) fail('redis ha factory not wired');
else ok('redis ha factory wired');
if (!redisSvc.includes('reconnect()')) fail('redis reconnect missing');
else ok('redis reconnect');

const prismaSvc = fs.readFileSync(path.join(TEL, 'prisma', 'prisma.service.ts'), 'utf8');
if (!prismaSvc.includes('DATABASE_POOL_MAX')) fail('postgres pool tuning missing');
else ok('postgres pool tuning');
if (!prismaSvc.includes('connectWithRetry')) fail('postgres connect retry missing');
else ok('postgres connect retry');

const haCtrl = fs.readFileSync(path.join(HA, 'controllers', 'ha.controller.ts'), 'utf8');
if (!haCtrl.includes("Get('readiness')")) fail('HA readiness endpoint missing');
else ok('HA readiness endpoint');

const appMod = fs.readFileSync(path.join(API, 'app', 'app.module.ts'), 'utf8');
if (!appMod.includes('EnterpriseHaModule')) fail('EnterpriseHaModule not imported');
else ok('EnterpriseHaModule wired');

const healthCtrl = fs.readFileSync(path.join(API, 'app', 'health.controller.ts'), 'utf8');
if (!healthCtrl.includes('ShutdownCoordinatorService')) fail('shutdown-aware readiness missing');
else ok('shutdown-aware readiness');
if (
  !healthCtrl.includes('phase17-enterprise-ha') &&
  !healthCtrl.includes('phase18-production-platform') &&
  !healthCtrl.includes('phase19-enterprise-migration-toolkit') &&
  !healthCtrl.includes('phase20-production-cutover') &&
  !healthCtrl.includes('remediation-complete')
) {
  fail('health mode not phase17+');
} else ok('health mode phase17+');

const envVal = fs.readFileSync(path.join(API, 'app', 'env.validation.ts'), 'utf8');
if (!envVal.includes('REDIS_MODE')) fail('REDIS_MODE env missing');
else ok('REDIS_MODE env');
if (!envVal.includes('KAMAILIO_NODES')) fail('KAMAILIO_NODES env missing');
else ok('KAMAILIO_NODES env');
if (!envVal.includes('TRUST_PROXY')) fail('TRUST_PROXY env missing');
else ok('TRUST_PROXY env');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase17-enterprise-ha') &&
  !svc.includes('phase18-production-platform') &&
  !svc.includes('phase19-enterprise-migration-toolkit') &&
  !svc.includes('phase20-production-cutover') &&
  !svc.includes('remediation-complete')
) {
  fail('telecom health mode not phase17+');
} else ok('telecom health mode phase17+');

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

const migDir = path.join(ROOT, 'prisma', 'migrations');
if (fs.existsSync(migDir)) {
  const migDiff = spawnSync('git', ['diff', '--', 'prisma/migrations'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if ((migDiff.stdout || '').trim()) fail('database migrations must stay frozen');
  else ok('migrations frozen');
}

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

const p16 = spawnSync('node', ['./scripts/telecom/validate-phase16.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p16.status !== 0) {
  console.error(p16.stdout || '');
  fail('phase 16 regression failed');
} else ok('phase 16 regression');

if (failed) {
  console.error('Phase 17 validation FAILED');
  process.exit(1);
}
console.log('Phase 17 validation PASSED');
