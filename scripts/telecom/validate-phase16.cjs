#!/usr/bin/env node
/**
 * Phase 16 Enterprise Security Hardening static validation.
 * Usage: node scripts/telecom/validate-phase16.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'apps', 'api', 'src');
const SEC = path.join(API, 'modules', 'enterprise-security');
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

mustExist(path.join(SEC, 'rate-limit', 'rate-limit.service.ts'), 'rate limit service');
mustExist(path.join(SEC, 'auth', 'auth-hardening.service.ts'), 'auth hardening');
mustExist(path.join(SEC, 'auth', 'refresh-token.service.ts'), 'refresh token service');
mustExist(path.join(SEC, 'auth', 'permissions.service.ts'), 'permissions service');
mustExist(path.join(SEC, 'headers', 'security-headers.middleware.ts'), 'security headers');
mustExist(path.join(SEC, 'secrets', 'log-redaction.service.ts'), 'log redaction');
mustExist(path.join(SEC, 'secrets', 'secret-validation.service.ts'), 'secret validation');
mustExist(path.join(SEC, 'filters', 'security-exception.filter.ts'), 'security exception filter');
mustExist(path.join(SEC, 'audit', 'security-audit.service.ts'), 'security audit');
mustExist(path.join(SEC, 'telecom', 'telecom-authorization.service.ts'), 'telecom authorization');

const rateGuard = fs.readFileSync(
  path.join(API, 'common', 'telecom', 'telecom-rate-limit.guard.ts'),
  'utf8',
);
if (!rateGuard.includes('RateLimitService')) fail('telecom rate limit not wired');
else ok('telecom rate limit wired');

const authCtrl = fs.readFileSync(path.join(API, 'modules', 'auth', 'auth.controller.ts'), 'utf8');
if (!authCtrl.includes("Post('logout')")) fail('logout endpoint missing');
else ok('logout endpoint');
if (!authCtrl.includes("Post('refresh')")) fail('refresh endpoint missing');
else ok('refresh endpoint');
if (!authCtrl.includes('AuthRateLimitGuard')) fail('auth rate limit guard missing');
else ok('auth rate limit on login');

const jwtGuard = fs.readFileSync(path.join(API, 'modules', 'auth', 'jwt-auth.guard.ts'), 'utf8');
if (!jwtGuard.includes('isSessionRevoked')) fail('session invalidation check missing');
else ok('JWT session invalidation');

const mainTs = fs.readFileSync(path.join(API, 'main.ts'), 'utf8');
if (!mainTs.includes('redactLogMessage')) fail('log redaction in main missing');
else ok('log redaction in main');
if (!mainTs.includes('json({ limit')) fail('request body limit missing');
else ok('request body limit');

const envVal = fs.readFileSync(path.join(API, 'app', 'env.validation.ts'), 'utf8');
if (!envVal.includes('assertProductionSecurity')) fail('production security env validation missing');
else ok('production security env validation');
if (!envVal.includes('RATE_LIMIT_AUTH_MAX')) fail('rate limit env vars missing');
else ok('rate limit env vars');

const redis = fs.readFileSync(path.join(TEL, 'redis', 'telecom-redis.service.ts'), 'utf8');
if (!redis.includes('rateLimitKey')) fail('security Redis keys missing');
else ok('security Redis keys');

const svc = fs.readFileSync(path.join(TEL, 'telecom.service.ts'), 'utf8');
if (
  !svc.includes('phase16-enterprise-security-hardening') &&
  !svc.includes('phase17-enterprise-ha') &&
  !svc.includes('phase18-production-platform') &&
  !svc.includes('phase19-enterprise-migration-toolkit') &&
  !svc.includes('phase20-production-cutover') &&
  !svc.includes('remediation-complete')
) {
  fail('telecom health mode not phase16+');
} else ok('telecom health mode phase16+');

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

const p15 = spawnSync('node', ['./scripts/telecom/validate-phase15.cjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
});
if (p15.status !== 0) {
  console.error(p15.stdout || '');
  fail('phase 15 regression failed');
} else ok('phase 15 regression');

if (failed) {
  console.error('Phase 16 validation FAILED');
  process.exit(1);
}
console.log('Phase 16 validation PASSED');
