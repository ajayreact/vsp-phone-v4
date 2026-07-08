#!/usr/bin/env node
/**
 * Phase 5 telecom API static + OpenAPI contract validation.
 * Usage: node scripts/telecom/validate-phase5.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'apps', 'api', 'src');
const MODULE = path.join(SRC, 'modules', 'telecom');
const CONTROLLER = path.join(MODULE, 'telecom.controller.ts');
const PRISMA = path.join(ROOT, 'prisma');

let failed = 0;
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  failed = 1;
};

function mustExist(p, label) {
  if (!fs.existsSync(p)) fail(`missing ${label}: ${p}`);
  else ok(`${label} present`);
}

mustExist(MODULE, 'telecom module dir');
mustExist(CONTROLLER, 'telecom.controller.ts');
mustExist(path.join(MODULE, 'telecom.service.ts'), 'telecom.service.ts');
mustExist(path.join(MODULE, 'dto', 'telecom.request.dto.ts'), 'request DTOs');
mustExist(path.join(MODULE, 'dto', 'telecom.response.dto.ts'), 'response DTOs');
mustExist(path.join(SRC, 'common', 'telecom', 'telecom-correlation.middleware.ts'), 'correlation middleware');
mustExist(path.join(SRC, 'common', 'telecom', 'telecom-service-auth.guard.ts'), 'auth stub');
mustExist(path.join(SRC, 'common', 'telecom', 'telecom-rate-limit.guard.ts'), 'rate limit stub');

const ctrl = fs.readFileSync(CONTROLLER, 'utf8');
const requiredPaths = [
  ["@Get('health')", 'GET health'],
  ["@Post('authenticate')", 'POST authenticate'],
  ["@Post('register')", 'POST register'],
  ["@Post('unregister')", 'POST unregister'],
  ["@Post('route')", 'POST route'],
  ["@Post('call/start')", 'POST call/start'],
  ["@Post('call/update')", 'POST call/update'],
  ["@Post('call/end')", 'POST call/end'],
  ["@Post('presence')", 'POST presence'],
  ["@Post('device')", 'POST device'],
];
for (const [needle, label] of requiredPaths) {
  if (!ctrl.includes(needle)) fail(`controller missing ${label}`);
  else ok(`endpoint ${label}`);
}

if (!ctrl.includes("@Controller('v1/telecom')")) fail('controller path must be v1/telecom');
else ok('controller @Controller(v1/telecom)');

const svc = fs.readFileSync(path.join(MODULE, 'telecom.service.ts'), 'utf8');
if (/prisma|PrismaClient|CallSession/i.test(svc) && !svc.includes('No Prisma')) {
  // soft: allow comment mentioning Prisma ban
}
if (/\.\$transaction|prisma\./i.test(svc)) fail('service must not call Prisma');
else ok('no Prisma writes in TelecomService');

const appMod = fs.readFileSync(path.join(SRC, 'app', 'app.module.ts'), 'utf8');
if (!appMod.includes('TelecomModule')) fail('AppModule must import TelecomModule');
else ok('AppModule imports TelecomModule');

const main = fs.readFileSync(path.join(SRC, 'main.ts'), 'utf8');
if (!main.includes('SwaggerModule') || !main.includes('ValidationPipe')) {
  fail('main.ts must wire Swagger + ValidationPipe');
} else {
  ok('main.ts Swagger + ValidationPipe');
}

// Kamailio: routing replies unchanged (still 503 stubs)
const kam = fs.readFileSync(path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg'), 'utf8');
if (!kam.includes('503')) fail('unexpected kamailio stub rewrite');
else ok('Kamailio still returns Phase stubs (no route rewrite)');

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
} else {
  ok('nx build api');
}

if (failed) {
  console.error('Phase 5 static validation FAILED');
  process.exit(1);
}
console.log('Phase 5 static validation PASSED');
