#!/usr/bin/env node
/**
 * Generate VSP Phone v4 development CA + leaf certificates (Node crypto).
 * Works on Windows/macOS/Linux without OpenSSL CLI.
 *
 * Usage: node scripts/tls/generate-dev-certs.mjs [--force]
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const TLS_ENV = process.env.TLS_ENV || 'development';
const TLS_ROOT = path.join(ROOT, 'infrastructure', 'tls');
const LIVE = path.join(TLS_ROOT, TLS_ENV, 'live');
const FORCE = process.argv.includes('--force');
const CA_DAYS = Number(process.env.TLS_CA_DAYS || 3650);
const LEAF_DAYS = Number(process.env.TLS_CERT_DAYS || 825);

const COMMON_SANS = [
  { type: 2, value: 'localhost' },
  { type: 7, ip: '127.0.0.1' },
  { type: 2, value: 'api' },
  { type: 2, value: 'admin' },
  { type: 2, value: 'kamailio' },
  { type: 2, value: 'sip' },
  { type: 2, value: 'wss' },
  { type: 2, value: 'prov' },
  { type: 2, value: 'api.localhost' },
  { type: 2, value: 'admin.localhost' },
  { type: 2, value: 'sip.localhost' },
  { type: 2, value: 'wss.localhost' },
  { type: 2, value: 'prov.localhost' },
  { type: 2, value: 'host.docker.internal' },
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(file, data, mode = 0o644) {
  fs.writeFileSync(file, data, { mode });
  try {
    fs.chmodSync(file, mode);
  } catch {
    /* windows */
  }
}

function pemPrivateKey(keyObject) {
  return keyObject.export({ type: 'pkcs8', format: 'pem' });
}

function unusedSanHelper(sans) {
  // Build SAN extension manually via X509CertificateBuilder alternatives:
  // Node 20+ Certificate Signing — use crypto.X509Certificate only for read;
  // We create via openssl-compatible path using crypto.generateKeyPair + forge-less approach:
  // Use `crypto` CertificateRequest isn't available; use openssl-free
  // `node:crypto` Sign with createCertificate from 'selfsigned' — avoid deps.
  // Implement with rfc5280 via @noble — avoid.
  // Practical approach: use `openssl` if present else Node's experimental?
  // Node 22+: no built-in CSR create still.
  // Use child_process? We don't have openssl on host.
  // Solution: use the `node:crypto` X509Certificate from a PEM we handcraft with
  // selfsigned algorithm — actually use `tls.createSecureContext` only needs valid PEM.
  // We'll implement CA and leaf with the documented `crypto.subtle` — too heavy.
  // FINAL: use `selfsigned` style with pure JS for ASN.1 — too large.
  // Check if node has createCertificate... No.
  // Use PowerShell fallback called from node? Failed on PKCS8.
  // Use `forge`? Don't add dependency without approval.
  // Minimal ASN.1 X.509 writer for RSA certs — implement compact version.
  return sans;
}

// ---- Minimal X.509 / ASN.1 PEM writer for RSA keys (Phase 2.dev CA) ----

function derEncodeLength(n) {
  if (n < 128) return Buffer.from([n]);
  const bytes = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTlv(tag, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from([tag]), derEncodeLength(buf.length), buf]);
}

function derOid(oid) {
  const parts = oid.split('.').map(Number);
  const body = [];
  body.push(40 * parts[0] + parts[1]);
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v < 128) body.push(v);
    else {
      const stack = [];
      stack.push(v & 0x7f);
      v >>= 7;
      while (v > 0) {
        stack.push(0x80 | (v & 0x7f));
        v >>= 7;
      }
      while (stack.length) body.push(stack.pop());
    }
  }
  return derTlv(0x06, Buffer.from(body));
}

function derInteger(buf) {
  let b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return derTlv(0x02, b);
}

function derNull() {
  return Buffer.from([0x05, 0x00]);
}

function derBitString(buf) {
  return derTlv(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function derUtf8(str) {
  return derTlv(0x0c, Buffer.from(str, 'utf8'));
}

function derPrintable(str) {
  return derTlv(0x13, Buffer.from(str, 'ascii'));
}

function derSetOf(seq) {
  return derTlv(0x31, seq);
}

function derSeq(parts) {
  return derTlv(0x30, Buffer.concat(parts));
}

function derContext(tagNum, content, constructed = true) {
  // Context-specific tags: constructed form uses 0xa0|n, primitive uses 0x80|n.
  // X.509 version ([0] EXPLICIT) MUST be constructed (0xa0).
  const tag = constructed ? 0xa0 | tagNum : 0x80 | tagNum;
  return derTlv(tag, content);
}

function nameAttr(oid, value, printable = false) {
  return derSetOf(derSeq([derOid(oid), printable ? derPrintable(value) : derUtf8(value)]));
}

function buildName(cn, org = 'VSP Phone v4') {
  return derSeq([
    nameAttr('2.5.4.6', 'US', true),
    nameAttr('2.5.4.8', 'Local'),
    nameAttr('2.5.4.7', 'Development'),
    nameAttr('2.5.4.10', org),
    nameAttr('2.5.4.3', cn),
  ]);
}

function encodeSan(sans) {
  const parts = [];
  for (const s of sans) {
    if (s.type === 2) {
      parts.push(derTlv(0x82, Buffer.from(s.value, 'ascii'))); // dNSName [2] IA5String
    } else if (s.type === 7) {
      const ip = s.ip.split('.').map((x) => Number(x));
      parts.push(derTlv(0x87, Buffer.from(ip))); // iPAddress [7]
    }
  }
  return derSeq(parts);
}

function validity(notBefore, notAfter) {
  function utcTime(d) {
    const pad = (n) => String(n).padStart(2, '0');
    const yy = String(d.getUTCFullYear()).slice(2);
    return derTlv(
      0x17,
      Buffer.from(
        `${yy}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`,
        'ascii',
      ),
    );
  }
  return derSeq([utcTime(notBefore), utcTime(notAfter)]);
}

function extension(oid, critical, value) {
  const parts = [derOid(oid)];
  if (critical) parts.push(Buffer.from([0x01, 0x01, 0xff]));
  parts.push(derTlv(0x04, value));
  return derSeq(parts);
}

function rsaPublicKeyDer(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');
  const rsaKey = derSeq([derInteger(n), derInteger(e)]);
  const alg = derSeq([derOid('1.2.840.113549.1.1.1'), derNull()]);
  return derSeq([alg, derBitString(rsaKey)]);
}

function signCert(tbs, privateKey) {
  const sig = crypto.sign('sha256', tbs, privateKey);
  const alg = derSeq([derOid('1.2.840.113549.1.1.11'), derNull()]); // sha256WithRSAEncryption
  return derSeq([tbs, alg, derBitString(sig)]);
}

function toPem(der, type) {
  const b64 = der.toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`;
}

function createCertificate({ subjectCn, issuerCn, subjectKey, issuerKey, isCa, sans, days, serial }) {
  const now = new Date();
  const notBefore = new Date(now.getTime() - 24 * 3600 * 1000);
  const notAfter = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const spki = rsaPublicKeyDer(subjectKey.publicKey || subjectKey);
  // subjectKey may be KeyObject pair
  const pub = subjectKey.publicKey ? subjectKey.publicKey : crypto.createPublicKey(subjectKey);
  const spkiActual = rsaPublicKeyDer(pub);
  const issuerName = buildName(issuerCn);
  const subjectName = buildName(subjectCn);

  const exts = [];
  if (isCa) {
    exts.push(extension('2.5.29.19', true, derSeq([Buffer.from([0x01, 0x01, 0xff])]))); // basicConstraints CA:true
    exts.push(
      extension(
        '2.5.29.15',
        true,
        Buffer.from([0x03, 0x02, 0x01, 0x06]),
      ),
    ); // keyUsage keyCertSign+cRLSign approx
  } else {
    exts.push(extension('2.5.29.19', true, derSeq([]))); // CA:false
    exts.push(extension('2.5.29.17', false, encodeSan(sans))); // SAN
    // EKU serverAuth + clientAuth
    exts.push(
      extension(
        '2.5.29.37',
        false,
        derSeq([derOid('1.3.6.1.5.5.7.3.1'), derOid('1.3.6.1.5.5.7.3.2')]),
      ),
    );
  }

  const extensions = derContext(3, derSeq(exts));
  const tbs = derSeq([
    derContext(0, derInteger(Buffer.from([0x02])), true), // version v3 EXPLICIT [0]
    derInteger(serial),
    derSeq([derOid('1.2.840.113549.1.1.11'), derNull()]),
    issuerName,
    validity(notBefore, notAfter),
    subjectName,
    spkiActual,
    extensions,
  ]);

  const signer = issuerKey.privateKey || issuerKey;
  const certDer = signCert(tbs, signer);
  return toPem(certDer, 'CERTIFICATE');
}

function issueCa() {
  const caDir = path.join(LIVE, 'ca');
  ensureDir(caDir);
  const keyPath = path.join(caDir, 'ca.key');
  const crtPath = path.join(caDir, 'ca.crt');
  if (fs.existsSync(keyPath) && !FORCE) {
    console.log('[skip] CA exists (use --force)');
    return {
      certPem: fs.readFileSync(crtPath, 'utf8'),
      key: crypto.createPrivateKey(fs.readFileSync(keyPath)),
    };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
  const serial = crypto.randomBytes(8);
  serial[0] &= 0x7f;
  const certPem = createCertificate({
    subjectCn: 'VSP Phone v4 Dev Root CA',
    issuerCn: 'VSP Phone v4 Dev Root CA',
    subjectKey: { publicKey, privateKey },
    issuerKey: { publicKey, privateKey },
    isCa: true,
    sans: [],
    days: CA_DAYS,
    serial,
  });
  writeFile(keyPath, pemPrivateKey(privateKey), 0o600);
  writeFile(crtPath, certPem, 0o644);
  ensureDir(path.join(TLS_ROOT, 'trust-store'));
  writeFile(path.join(TLS_ROOT, 'trust-store', 'dev-ca.crt'), certPem, 0o644);
  console.log('[ok] development CA');
  return { certPem, key: privateKey, publicKey };
}

function issueLeaf(name, cn, ca) {
  const dir = path.join(LIVE, name);
  ensureDir(dir);
  const keyPath = path.join(dir, 'privkey.pem');
  const crtPath = path.join(dir, 'cert.pem');
  const fullPath = path.join(dir, 'fullchain.pem');
  if (fs.existsSync(keyPath) && !FORCE) {
    console.log(`[skip] ${name} already exists (use --force)`);
    return;
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serial = crypto.randomBytes(8);
  serial[0] &= 0x7f;
  const certPem = createCertificate({
    subjectCn: cn,
    issuerCn: 'VSP Phone v4 Dev Root CA',
    subjectKey: { publicKey, privateKey },
    issuerKey: ca.key,
    isCa: false,
    sans: COMMON_SANS,
    days: LEAF_DAYS,
    serial,
  });
  writeFile(keyPath, pemPrivateKey(privateKey), 0o600);
  writeFile(crtPath, certPem, 0o644);
  writeFile(fullPath, certPem + ca.certPem, 0o644);
  console.log(`[ok] issued ${name} (${cn})`);
}

function copyBundle(fromDir, toName) {
  const to = path.join(LIVE, toName);
  ensureDir(to);
  for (const f of ['privkey.pem', 'cert.pem', 'fullchain.pem']) {
    const src = path.join(LIVE, fromDir, f);
    if (fs.existsSync(src)) writeFile(path.join(to, f), fs.readFileSync(src), f === 'privkey.pem' ? 0o600 : 0o644);
  }
}

function main() {
  ensureDir(LIVE);
  const ca = issueCa();
  if (!ca.publicKey) {
    // reload public from cert for consistency
  }
  issueLeaf('api', 'api.localhost', ca);
  issueLeaf('admin', 'admin.localhost', ca);
  issueLeaf('sip', 'sip.localhost', ca);
  issueLeaf('prov', 'prov.localhost', ca);
  copyBundle('sip', 'wss');
  console.log('[ok] wss linked to sip leaf');
  const kam = path.join(LIVE, 'kamailio');
  ensureDir(kam);
  writeFile(path.join(kam, 'privkey.pem'), fs.readFileSync(path.join(LIVE, 'sip', 'privkey.pem')), 0o600);
  writeFile(path.join(kam, 'fullchain.pem'), fs.readFileSync(path.join(LIVE, 'sip', 'fullchain.pem')), 0o644);
  writeFile(path.join(kam, 'ca.crt'), fs.readFileSync(path.join(LIVE, 'ca', 'ca.crt')), 0o644);
  console.log('[ok] kamailio cert bundle');
  writeFile(
    path.join(LIVE, 'MANIFEST.txt'),
    [
      `generated_at=${new Date().toISOString()}`,
      `tls_env=${TLS_ENV}`,
      `ca_days=${CA_DAYS}`,
      `leaf_days=${LEAF_DAYS}`,
      'leaves=api,admin,sip,wss,prov,kamailio',
      'generator=node-crypto',
      '',
    ].join('\n'),
  );
  console.log(`Done. Live material: ${LIVE}`);
  console.log('Validate: node scripts/tls/validate-certs.mjs');
}

main();
