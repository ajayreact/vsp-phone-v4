#!/usr/bin/env node
/**
 * Static validation of Kamailio Phase 3 foundation (no Docker required).
 * Usage: node scripts/kamailio/validate-phase3.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const CFG = path.join(ROOT, 'infrastructure', 'kamailio', 'kamailio.cfg');
const TLS = path.join(ROOT, 'infrastructure', 'kamailio', 'tls.cfg');
const DISP = path.join(ROOT, 'infrastructure', 'kamailio', 'dispatcher.list');
const PERM = path.join(ROOT, 'infrastructure', 'kamailio', 'permissions.address');
const LIVE = path.join(ROOT, 'infrastructure', 'tls', 'development', 'live', 'kamailio');

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

function mustInclude(file, needles, label) {
  const text = fs.readFileSync(file, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) fail(`${label} missing "${n}"`);
    else ok(`${label} has ${n}`);
  }
}

mustExist(CFG, 'kamailio.cfg');
mustExist(TLS, 'tls.cfg');
mustExist(DISP, 'dispatcher.list');
mustExist(PERM, 'permissions.address');
mustExist(path.join(LIVE, 'fullchain.pem'), 'TLS fullchain');
mustExist(path.join(LIVE, 'privkey.pem'), 'TLS privkey');

mustInclude(CFG, [
  'loadmodule "usrloc.so"',
  'loadmodule "registrar.so"',
  'loadmodule "auth.so"',
  'loadmodule "dispatcher.so"',
  'loadmodule "permissions.so"',
  'loadmodule "dialog.so"',
  'loadmodule "nathelper.so"',
  'loadmodule "pike.so"',
  'loadmodule "rtpengine.so"',
  'loadmodule "tls.so"',
  'loadmodule "websocket.so"',
  'loadmodule "xhttp.so"',
  'listen=udp:0.0.0.0:5060',
  'listen=tcp:0.0.0.0:5060',
  'listen=tls:0.0.0.0:5061',
  'listen=tcp:0.0.0.0:8080',
  'listen=tls:0.0.0.0:8443',
  'listen=tcp:0.0.0.0:8880',
  'options_reply()',
  'route[REGISTRAR]',
  'route[NESTJS_HTTP_POST]',
  'http_client_query',
  'contact_flows_avp',
  'rtpengine_sock',
  '/health',
], 'kamailio.cfg');

mustInclude(TLS, ['privkey.pem', 'fullchain.pem', '[server:default]', '[server:8443]'], 'tls.cfg');
mustInclude(DISP, ['rtpengine', 'telnyx'], 'dispatcher.list');

const cfg = fs.readFileSync(CFG, 'utf8');
// Phase 6: REGISTER may call NestJS; INVITE must remain stubbed
if (!cfg.includes('auth/sip-digest') && !cfg.includes('REGISTRAR_STUB')) {
  fail('REGISTER integration path missing');
} else {
  ok('REGISTER NestJS/auth path present');
}
if (!cfg.includes('route[INVITE]') || !cfg.includes('routing/resolve')) {
  fail('INVITE routing path missing (Phase 7)');
} else {
  ok('INVITE NestJS routing path present');
}
if (/Service Unavailable - VSP Kamailio Phase 3 foundation/.test(cfg)) {
  fail('legacy Phase 3 INVITE foundation stub must be removed');
} else {
  ok('legacy INVITE foundation stub removed');
}
if (/rtpengine_offer\s*\(|rtpengine_answer\s*\(/.test(cfg)) {
  if (!/Phase 9/.test(cfg)) {
    fail('RTP offer/answer not allowed before Phase 9');
  } else {
    ok('Phase 9 rtpengine_offer/answer present');
  }
} else {
  ok('no RTP offer/answer');
}
if (/route\[QUEUE/.test(cfg)) {
  fail('route[QUEUE legacy not allowed');
} else if (/APP_MEDIA/.test(cfg)) {
  if (/route\[APP_MEDIA_RELAY]/.test(cfg) && /route\[ROUTING_CONTINUE]/.test(cfg)) {
    ok('remediation APP_MEDIA/ROUTING_CONTINUE routes present');
  } else {
    fail('APP_MEDIA present without remediation routes');
  }
} else {
  ok('no queue/APP_MEDIA routes');
}

if (failed) {
  console.error('Phase 3 static validation FAILED');
  process.exit(1);
}
console.log('Phase 3 static validation PASSED');
