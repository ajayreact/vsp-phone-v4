#!/usr/bin/env node
'use strict';

/**
 * RC1 — diagnose Admin BFF → API upstream (run ON EC2).
 *
 * Usage:
 *   # From host (uses public API for JWT, then probes from admin container):
 *   TENANT_EMAIL=... TENANT_PASSWORD=... node scripts/platform/diagnose-bff-upstream.cjs
 *
 *   # Inside admin container (token already known):
 *   docker exec -e TOKEN=eyJ... vsp-admin node /app/scripts/platform/diagnose-bff-upstream.cjs --in-container
 *
 * Does NOT set NODE_TLS_REJECT_UNAUTHORIZED. Reports raw TLS/DNS/TCP failures.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const API_PUBLIC = (process.env.API_BASE || 'https://api.vspphone.com/api').replace(/\/$/, '');
const IN_CONTAINER = process.argv.includes('--in-container') || process.env.DIAG_IN_CONTAINER === '1';

const CANDIDATES = [
  'http://api:3000/api/health',
  'https://api:3000/api/health',
  'http://vsp-api:3000/api/health',
  'https://vsp-api:3000/api/health',
  'http://127.0.0.1:3000/api/health',
  'https://127.0.0.1:3000/api/health',
  `${API_PUBLIC}/health`,
];

function classifyError(err) {
  const cause = err && typeof err === 'object' ? err.cause : null;
  const code = cause?.code || err?.code || '';
  const msg = String(err?.message || '');
  const causeMsg = String(cause?.message || '');
  const combined = `${code} ${msg} ${causeMsg}`.toLowerCase();

  let dns = 'unknown';
  let tcp = 'unknown';
  let tls = 'unknown';

  if (/enotfound|eai_again|getaddrinfo/.test(combined)) {
    dns = 'FAIL';
    tcp = 'n/a';
    tls = 'n/a';
  } else if (/econnrefused|etimedout|enetunreach|ehostunreach/.test(combined)) {
    dns = 'OK (resolved or IP)';
    tcp = 'FAIL';
    tls = 'n/a';
  } else if (
    /cert|ssl|tls|unable to verify|hostname\/ip does not match|altname|self.signed|depth zero|err_tls|eproto|wrong version number/.test(
      combined,
    )
  ) {
    dns = 'OK';
    tcp = 'OK (connected)';
    tls = 'FAIL';
  } else if (msg.includes('fetch failed') && cause) {
    dns = 'likely OK';
    tcp = code ? `see cause.code=${code}` : 'unknown';
    tls = /ssl|tls|cert|eproto/i.test(combined) ? 'FAIL' : 'unknown';
  }

  return { dns, tcp, tls, code, causeMsg };
}

async function probe(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'manual',
    });
    const text = await res.text();
    return {
      url,
      ok: true,
      dns: 'OK',
      tcp: 'OK',
      tls: url.startsWith('https:') ? 'OK (handshake completed)' : 'n/a (http)',
      status: res.status,
      body: text.slice(0, 180),
      ms: Date.now() - started,
    };
  } catch (err) {
    const classed = classifyError(err);
    return {
      url,
      ok: false,
      ...classed,
      status: null,
      errorName: err?.name,
      errorMessage: err?.message,
      errorCauseName: err?.cause?.name,
      errorCauseMessage: err?.cause?.message,
      errorCauseCode: err?.cause?.code,
      errorStack: String(err?.stack || '').split('\n').slice(0, 6).join('\n'),
      ms: Date.now() - started,
    };
  }
}

async function authMe(base, token) {
  const url = `${base.replace(/\/$/, '')}/v1/auth/me`;
  console.log('\n=== auth/me probe ===');
  console.log('base URL:', base);
  console.log('final URL:', url);
  console.log('request method: GET');
  console.log('Authorization: Bearer <present>');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const text = await res.text();
    console.log('response status:', res.status);
    console.log('response body:', text.slice(0, 400));
    return { url, status: res.status, body: text };
  } catch (err) {
    console.log('FETCH EXCEPTION (not swallowed)');
    console.log('  error.name:', err?.name);
    console.log('  error.message:', err?.message);
    console.log('  error.cause:', err?.cause);
    console.log('  error.cause?.code:', err?.cause?.code);
    console.log('  error.cause?.message:', err?.cause?.message);
    console.log('  error.stack:\n', err?.stack);
    return { url, error: err };
  }
}

async function login() {
  const email = process.env.TENANT_EMAIL || '';
  const password = process.env.TENANT_PASSWORD || '';
  if (!email || !password) return null;
  const res = await fetch(`${API_PUBLIC}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  const token = json.accessToken || json.data?.accessToken || null;
  console.log('login status:', res.status, 'token:', token ? 'yes' : 'no');
  return token;
}

async function runInContainer(token) {
  console.log('\n=== Container env ===');
  console.log('API_INTERNAL_URL=', process.env.API_INTERNAL_URL || '(unset)');
  console.log('NEXT_PUBLIC_API_URL=', process.env.NEXT_PUBLIC_API_URL || '(unset)');
  console.log('NODE_TLS_REJECT_UNAUTHORIZED=', process.env.NODE_TLS_REJECT_UNAUTHORIZED || '(unset)');

  console.log('\n=== Health probes (no TLS verify override) ===');
  for (const url of CANDIDATES) {
    const r = await probe(url);
    console.log('\n---', url);
    console.log(JSON.stringify(r, null, 2));
  }

  if (!token) {
    console.log('\nNo TOKEN — skip auth/me');
    return;
  }

  const bases = [
    process.env.API_INTERNAL_URL,
    'http://api:3000/api',
    'https://api:3000/api',
    'https://api.vspphone.com/api',
  ].filter(Boolean);

  const unique = [...new Set(bases)];
  for (const base of unique) {
    await authMe(base, token);
  }
}

async function runFromHost() {
  console.log('=== Host orchestration ===');
  console.log('Public API:', API_PUBLIC);

  const token = process.env.TOKEN || (await login());
  if (!token) {
    console.error('Set TENANT_EMAIL/TENANT_PASSWORD or TOKEN');
    process.exit(1);
  }

  // API listener from api container
  console.log('\n=== API listener (ss / node) ===');
  const ss = spawnSync(
    'docker',
    [
      'exec',
      'vsp-api',
      'sh',
      '-c',
      'command -v ss >/dev/null && ss -tlnp || netstat -tlnp 2>/dev/null || node -e "const n=require(\\"net\\"); const s=n.createServer(); s.listen(0,()=>{console.log(\\"node_ok\\"); s.close()})" ; echo TLS_ENABLED=$TLS_ENABLED; printenv TLS_ENABLED TLS_API_CERT_FILE PORT | cat',
    ],
    { encoding: 'utf8' },
  );
  console.log(ss.stdout || '');
  console.log(ss.stderr || '');

  console.log('\n=== docker printenv (admin) ===');
  const env = spawnSync(
    'docker',
    ['exec', 'vsp-admin', 'printenv', 'API_INTERNAL_URL', 'NEXT_PUBLIC_API_URL', 'NODE_TLS_REJECT_UNAUTHORIZED'],
    { encoding: 'utf8' },
  );
  console.log(env.stdout || env.stderr);

  // Copy this script into container if not mounted — use stdin node -e bootstrap via docker exec env
  const scriptPath = '/tmp/diagnose-bff-upstream.cjs';
  const self = path.resolve(__dirname, 'diagnose-bff-upstream.cjs');
  spawnSync('docker', ['cp', self, `vsp-admin:${scriptPath}`], { encoding: 'utf8' });

  console.log('\n=== Probes from inside vsp-admin ===');
  const inner = spawnSync(
    'docker',
    ['exec', '-e', `TOKEN=${token}`, '-e', `API_BASE=${API_PUBLIC}`, '-e', 'DIAG_IN_CONTAINER=1', 'vsp-admin', 'node', scriptPath, '--in-container'],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
  );
  console.log(inner.stdout || '');
  if (inner.stderr) console.error(inner.stderr);
  process.exit(inner.status || 0);
}

(async () => {
  if (IN_CONTAINER) {
    await runInContainer(process.env.TOKEN || '');
  } else {
    await runFromHost();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
