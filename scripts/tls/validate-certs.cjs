#!/usr/bin/env node
/**
 * Validate VSP Phone v4 TLS live material (no openssl required).
 * Usage: node scripts/tls/validate-certs.mjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tls = require('node:tls');
const https = require('node:https');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '../..');
const TLS_ENV = process.env.TLS_ENV || 'development';
const LIVE = path.join(ROOT, 'infrastructure', 'tls', TLS_ENV, 'live');

const LEAVES = ['api', 'admin', 'sip', 'wss', 'prov', 'kamailio'];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function readPem(file) {
  if (!fs.existsSync(file)) {
    fail(`missing ${file}`);
    return null;
  }
  return fs.readFileSync(file);
}

function loadX509(pem) {
  try {
    return new crypto.X509Certificate(pem);
  } catch (err) {
    fail(`parse cert: ${err.message}`);
    return null;
  }
}

function checkPermissionsHint(file) {
  // Windows ACLs differ; on POSIX ensure key is not world-readable when possible.
  if (process.platform === 'win32') {
    return;
  }
  try {
    const mode = fs.statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      fail(`permissions too open on ${file} (mode ${mode.toString(8)}; expect 600)`);
    } else {
      ok(`permissions ${file} mode ${mode.toString(8)}`);
    }
  } catch {
    /* ignore */
  }
}

function assertNotTrackedKeys() {
  // Soft check: ensure common key paths under live are present locally but remind gitignore.
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  if (!gitignore.includes('*.key') && !gitignore.includes('*.pem')) {
    fail('root .gitignore must ignore private key material');
  } else {
    ok('gitignore contains key/pem ignores');
  }
  const tlsIgnore = path.join(ROOT, 'infrastructure', 'tls', '.gitignore');
  if (!fs.existsSync(tlsIgnore)) {
    fail('infrastructure/tls/.gitignore missing');
  } else {
    ok('tls .gitignore present');
  }
}

function validateTree() {
  if (!fs.existsSync(LIVE)) {
    fail(`live dir missing: ${LIVE} — run generate-dev-certs first`);
    return;
  }
  ok(`live dir ${LIVE}`);

  const caCrt = readPem(path.join(LIVE, 'ca', 'ca.crt'));
  const caKey = readPem(path.join(LIVE, 'ca', 'ca.key'));
  if (!caCrt || !caKey) return;
  checkPermissionsHint(path.join(LIVE, 'ca', 'ca.key'));
  const ca = loadX509(caCrt);
  if (!ca) return;
  if (!ca.ca) {
    fail('CA certificate basicConstraints CA bit not set / not detected as CA');
  } else {
    ok(`CA subject=${ca.subject} valid ${ca.validFrom} → ${ca.validTo}`);
  }

  for (const name of LEAVES) {
    const dir = path.join(LIVE, name);
    const key = path.join(dir, name === 'kamailio' ? 'privkey.pem' : 'privkey.pem');
    const certPath = path.join(dir, name === 'kamailio' ? 'fullchain.pem' : 'cert.pem');
    const full = path.join(dir, 'fullchain.pem');
    const keyBuf = readPem(key);
    const certBuf = readPem(certPath);
    const fullBuf = readPem(full);
    if (!keyBuf || !certBuf || !fullBuf) continue;
    checkPermissionsHint(key);
    const leaf = loadX509(certBuf.includes('BEGIN') ? certBuf : fullBuf);
    if (!leaf) continue;
    if (new Date(leaf.validTo) < new Date()) {
      fail(`${name} certificate expired (${leaf.validTo})`);
    } else {
      ok(`${name} subject=${leaf.subject} SAN=${leaf.subjectAltName || 'n/a'}`);
    }
    // Key parses as private key
    try {
      crypto.createPrivateKey(keyBuf);
      ok(`${name} private key parses`);
    } catch (err) {
      fail(`${name} private key invalid: ${err.message}`);
    }
  }
}

function smokeHttpsServer() {
  const key = readPem(path.join(LIVE, 'api', 'privkey.pem'));
  const cert = readPem(path.join(LIVE, 'api', 'fullchain.pem'));
  const ca = readPem(path.join(LIVE, 'ca', 'ca.crt'));
  if (!key || !cert || !ca) return;

  return new Promise((resolve) => {
    const server = https.createServer({ key, cert }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', tls: true }));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = https.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/',
          ca,
          servername: 'api.localhost',
          rejectUnauthorized: true,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            server.close();
            if (res.statusCode === 200 && body.includes('"tls":true')) {
              ok(`HTTPS smoke handshake OK on 127.0.0.1:${port}`);
            } else {
              fail(`HTTPS smoke unexpected response ${res.statusCode} ${body}`);
            }
            resolve();
          });
        },
      );
      req.on('error', (err) => {
        server.close();
        fail(`HTTPS smoke failed: ${err.message}`);
        resolve();
      });
    });
  });
}

function checkKamailioTlsCfg() {
  const cfg = path.join(ROOT, 'infrastructure', 'kamailio', 'tls.cfg');
  if (!fs.existsSync(cfg)) {
    fail('infrastructure/kamailio/tls.cfg missing');
    return;
  }
  const text = fs.readFileSync(cfg, 'utf8');
  if (!text.includes('privkey.pem') || !text.includes('fullchain.pem')) {
    fail('tls.cfg missing certificate path references');
  } else {
    ok('kamailio tls.cfg present with cert paths');
  }
}

async function main() {
  console.log(`Validating TLS_ENV=${TLS_ENV}`);
  assertNotTrackedKeys();
  validateTree();
  checkKamailioTlsCfg();
  await smokeHttpsServer();
  if (process.exitCode) {
    console.error('Validation completed with failures');
    process.exit(process.exitCode);
  }
  console.log('All Phase 2 certificate validations passed');
}

main();
