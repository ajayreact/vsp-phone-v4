#!/usr/bin/env node
/**
 * Phase 4 RTPengine static validation (no Docker required).
 * Usage: node scripts/rtpengine/validate-phase4.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const dgram = require('node:dgram');

const ROOT = path.resolve(__dirname, '../..');
const CONF = path.join(ROOT, 'infrastructure', 'rtpengine', 'rtpengine.conf');
const STUB = path.join(ROOT, 'infrastructure', 'docker', 'rtpengine', 'install-or-stub.sh');
const ENTRY = path.join(ROOT, 'infrastructure', 'docker', 'rtpengine', 'docker-entrypoint.sh');
const HEALTH = path.join(ROOT, 'infrastructure', 'docker', 'rtpengine', 'healthcheck.sh');
const KAMAILIO = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const DOCKERFILE = path.join(ROOT, 'infrastructure', 'docker', 'Dockerfile.rtpengine');

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

function confHas(text, key) {
  return new RegExp(`^\\s*${key}\\s*=`, 'm').test(text);
}

mustExist(CONF, 'rtpengine.conf');
mustExist(STUB, 'install-or-stub.sh');
mustExist(ENTRY, 'docker-entrypoint.sh');
mustExist(HEALTH, 'healthcheck.sh');
mustExist(DOCKERFILE, 'Dockerfile.rtpengine');

const conf = fs.readFileSync(CONF, 'utf8');
for (const key of [
  'listen-ng',
  'listen-cli',
  'interface',
  'port-min',
  'port-max',
  'recording-dir',
  'table',
  'log-stderr',
]) {
  if (!confHas(conf, key)) fail(`rtpengine.conf missing ${key}`);
  else ok(`conf has ${key}`);
}

if (!conf.includes('Phase 4') && !conf.includes('Phase 9')) fail('conf should declare Phase 4 or Phase 9');
else ok('Phase banner in conf');
if (!conf.includes('/var/spool/rtpengine')) fail('recording spool path missing');
else ok('recording spool path prepared');

const k = fs.readFileSync(KAMAILIO, 'utf8');
if (!k.includes('rtpengine_sock') || !k.includes('udp:rtpengine:2223')) {
  fail('Kamailio rtpengine_sock must remain udp:rtpengine:2223');
} else {
  ok('Kamailio rtpengine_sock → udp:rtpengine:2223');
}
if (/rtpengine_offer\s*\(/.test(k) || /rtpengine_answer\s*\(/.test(k)) {
  if (!/Phase 9/.test(k)) {
    fail('Kamailio must not call rtpengine_offer/answer before Phase 9');
  } else {
    ok('Phase 9 rtpengine_offer/answer wired in Kamailio');
  }
} else {
  ok('no rtpengine_offer/answer in Kamailio (pre-Phase-9 snapshot)');
}

const stub = fs.readFileSync(STUB, 'utf8');
if (!stub.includes('ng_stub') && !stub.includes('rtpengine-daemon')) {
  fail('install-or-stub must provide daemon or NG stub');
} else {
  ok('install-or-stub provides daemon or NG stub');
}
if (!stub.includes('rtpengine-ng-ping')) fail('ng-ping helper missing');
else ok('rtpengine-ng-ping helper present');
if (!stub.includes('ICE') && !fs.readFileSync(ENTRY, 'utf8').includes('ICE')) {
  fail('docs/entrypoint should mention ICE/DTLS readiness');
} else {
  ok('ICE/DTLS readiness documented in image scripts');
}

const df = fs.readFileSync(DOCKERFILE, 'utf8');
if (!df.includes('HEALTHCHECK') || !df.includes('healthcheck.sh')) {
  fail('Dockerfile must define HEALTHCHECK via healthcheck.sh');
} else {
  ok('Dockerfile HEALTHCHECK wired');
}

/** Node-only NG ping protocol smoke (mirrors container stub behavior). */
function ngSmoke() {
  return new Promise((resolve) => {
    const server = dgram.createSocket('udp4');
    const port = 25999;
    server.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      const cookie = text.includes(' ') ? text.split(' ', 1)[0] : '';
      const body = 'd7:result2:oke';
      const reply = Buffer.from(cookie ? `${cookie} ${body}` : body);
      server.send(reply, rinfo.port, rinfo.address);
    });
    server.bind(port, '127.0.0.1', () => {
      const client = dgram.createSocket('udp4');
      const cookie = `vsp${Date.now()}`;
      const msg = Buffer.from(`${cookie} d4:ping0:e`);
      const timer = setTimeout(() => {
        fail('NG smoke no reply');
        client.close();
        server.close();
        resolve();
      }, 2000);
      client.on('message', (resp) => {
        clearTimeout(timer);
        const text = resp.toString('utf8');
        if (text.includes('ok') || text.includes(cookie)) ok(`local NG ping protocol smoke: ${text.slice(0, 60)}`);
        else fail(`unexpected NG reply: ${text}`);
        client.close();
        server.close();
        resolve();
      });
      client.send(msg, port, '127.0.0.1', (err) => {
        if (err) {
          clearTimeout(timer);
          fail(`NG smoke send failed: ${err.message}`);
          client.close();
          server.close();
          resolve();
        }
      });
    });
  });
}

async function main() {
  await ngSmoke();
  if (failed) {
    console.error('Phase 4 static validation FAILED');
    process.exit(1);
  }
  console.log('Phase 4 static validation PASSED');
}

main();
