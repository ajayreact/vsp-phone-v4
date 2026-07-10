#!/usr/bin/env node
/**
 * RC3 — static telecom infrastructure certification validator.
 * Usage: node scripts/rc3/validate-telecom-infrastructure.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
let failed = 0;
const ok = (m) => console.log(`  OK  ${m}`);
const fail = (m) => {
  console.error(`  FAIL ${m}`);
  failed = 1;
};
const warn = (m) => console.warn(`  WARN ${m}`);

function mustExist(rel, label) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) fail(`missing ${label}: ${rel}`);
  else ok(`${label}`);
  return p;
}

function fileContains(rel, needle, label) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!text.includes(needle)) fail(`${label}: ${rel} missing "${needle}"`);
  else ok(label);
}

console.log('RC3 Telecom Infrastructure Validation\n');

console.log('--- RTPengine ---');
mustExist('infrastructure/docker/Dockerfile.rtpengine', 'Dockerfile.rtpengine');
fileContains('infrastructure/docker/Dockerfile.rtpengine', 'RTPENGINE_REQUIRE_DAEMON', 'prod build arg');
fileContains('infrastructure/docker/rtpengine/install-or-stub.sh', 'dfx.at/rtpengine', 'dfx.at repo fallback');
fileContains('infrastructure/docker/rtpengine/healthcheck.sh', 'RTPENGINE_REQUIRE_DAEMON', 'prod health rejects stub');
fileContains('infrastructure/rtpengine/rtpengine.conf', 'recording-method = proc', 'recording enabled');

console.log('\n--- Kamailio ---');
mustExist('infrastructure/kamailio/kamailio.cfg', 'kamailio.cfg');
fileContains('infrastructure/kamailio/kamailio.cfg', 'loadmodule "refer.so"', 'REFER module');
fileContains('infrastructure/kamailio/kamailio.cfg', 'route[REFER]', 'REFER route');
fileContains('infrastructure/kamailio/kamailio.cfg', 'rtpengine_offer', 'RTPengine offer');

console.log('\n--- Deployment ---');
mustExist('docker-compose.prod.yml', 'docker-compose.prod.yml');
fileContains('docker-compose.prod.yml', 'RTPENGINE_REQUIRE_DAEMON', 'prod rtpengine require');
fileContains('docker-compose.prod.yml', 'tenant.vspphone.com', 'tenant CORS default');
mustExist('docker-compose.monitoring.yml', 'docker-compose.monitoring.yml');
mustExist('infrastructure/monitoring/prometheus/prometheus.yml', 'prometheus.yml');
fileContains('infrastructure/nginx/vsp-phone-v4.conf', 'tenant.vspphone.com', 'nginx tenant vhost');

console.log('\n--- Smoke tests ---');
fileContains(
  'apps/api/src/modules/production-cutover/smoke-tests/smoke-test.service.ts',
  'QUEUE_MEDIA_URI',
  'smoke test QUEUE_MEDIA_URI',
);
fileContains(
  'apps/api/src/modules/production-cutover/smoke-tests/smoke-test.service.ts',
  'rtpengine_media',
  'smoke test rtpengine_media',
);

console.log('\n--- Optional live checks (Docker) ---');
try {
  const ps = execSync('docker compose ps --format json', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (ps.trim()) {
    const backend = execSync('docker compose exec -T rtpengine cat /etc/rtpengine/.backend 2>/dev/null || echo unknown', {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
    }).trim();
    if (backend === 'real') ok(`rtpengine container backend=${backend}`);
    else if (backend === 'stub') warn(`rtpengine container backend=${backend} — use docker-compose.prod.yml for production`);
    else warn(`rtpengine backend unknown (container may be stopped)`);
  } else {
    warn('Docker stack not running — skip live rtpengine backend check');
  }
} catch {
  warn('Docker not available — skip live checks');
}

console.log('\n--- Phase validators ---');
for (const script of ['scripts/kamailio/validate-phase3.cjs', 'scripts/rtpengine/validate-phase4.cjs']) {
  try {
    execSync(`node ${script}`, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    failed = 1;
  }
}

console.log(failed ? '\nRC3 validation FAILED' : '\nRC3 validation PASSED');
process.exit(failed ? 1 : 0);
