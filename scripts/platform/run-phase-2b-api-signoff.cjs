#!/usr/bin/env node
'use strict';

/**
 * Phase 2B API sign-off (no browser) — validates detail load + save round-trips.
 * Uses static/runtime-verification/2b-signoff-env.json or TENANT_* env.
 */

const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.vspphone.com/api').replace(/\/$/, '');
const ENV_FILE = path.join(process.cwd(), 'static', 'runtime-verification', '2b-signoff-env.json');
const OUT = path.join(process.cwd(), 'static', 'runtime-verification', '2b-api-signoff.json');

const creds = fs.existsSync(ENV_FILE)
  ? JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'))
  : { email: process.env.TENANT_EMAIL, password: process.env.TENANT_PASSWORD };

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, urlPath, { token, body } = {}) {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function unwrap(res) {
  return res.json?.data ?? res.json;
}

async function main() {
  const login = await api('POST', '/v1/auth/login', {
    body: { email: creds.email, password: creds.password },
  });
  const token = unwrap(login)?.accessToken;
  record('Tenant login', Boolean(token), `HTTP ${login.status}`);
  if (!token) {
    fs.writeFileSync(OUT, JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
    process.exit(1);
  }

  const hub = unwrap(await api('GET', '/v1/tenant/extensions/hub', { token })) || [];
  record('Hub loads', Array.isArray(hub) && hub.length > 0, `count=${hub.length}`);

  const stats = await api('GET', '/v1/tenant/extensions/hub/stats', { token });
  record('Hub stats', stats.ok, `HTTP ${stats.status}`);

  const ext101 = hub.find((r) => r.extension === '101') || hub[0];
  record('Extension 101 present', Boolean(ext101), ext101?.label ?? 'none');

  const detail = unwrap(await api('GET', `/v1/tenant/extensions/${ext101.id}`, { token }));
  const ts = detail?.line?.telephonySettings ?? {};
  const callerId = detail?.line?.callerId?.callerIdName ?? '';
  record('Detail GET', Boolean(detail?.line), `callerId=${callerId || '(empty)'}`);

  const testCallerId = callerId ? `${callerId} API` : 'Reception API';
  await api('PATCH', `/v1/tenant/extensions/${ext101.id}`, {
    token,
    body: { callerIdName: testCallerId },
  });
  const detail2 = unwrap(await api('GET', `/v1/tenant/extensions/${ext101.id}`, { token }));
  record(
    'Caller ID round-trip',
    detail2?.line?.callerId?.callerIdName === testCallerId,
    detail2?.line?.callerId?.callerIdName ?? '',
  );
  await api('PATCH', `/v1/tenant/extensions/${ext101.id}`, { token, body: { callerIdName: callerId || undefined } });

  await api('PATCH', `/v1/tenant/extensions/${ext101.id}`, {
    token,
    body: { settings: { pin: '4321', voicemailNotifyEmail: 'vm-api@verify.vspphone.com' } },
  });
  const detail3 = unwrap(await api('GET', `/v1/tenant/extensions/${ext101.id}`, { token }));
  record(
    'Voicemail round-trip',
    detail3?.line?.telephonySettings?.pin === '4321' &&
      detail3?.line?.telephonySettings?.voicemailNotifyEmail === 'vm-api@verify.vspphone.com',
    `pin=${detail3?.line?.telephonySettings?.pin}`,
  );

  await api('PATCH', `/v1/tenant/extensions/${ext101.id}`, {
    token,
    body: {
      settings: {
        callForwardEnabled: true,
        callForwardDestination: '102',
        dndEnabled: true,
      },
    },
  });
  const detail4 = unwrap(await api('GET', `/v1/tenant/extensions/${ext101.id}`, { token }));
  const s4 = detail4?.line?.telephonySettings ?? {};
  record(
    'Call handling round-trip',
    s4.callForwardEnabled === true && s4.dndEnabled === true && s4.callForwardDestination === '102',
    JSON.stringify({ forward: s4.callForwardEnabled, dnd: s4.dndEnabled, dest: s4.callForwardDestination }),
  );

  const recording = detail4?.line?.recordingPolicy?.recordingEnabled;
  record('Recording loads from policy', recording !== undefined, `recordingEnabled=${recording}`);

  const qr = await api('POST', `/v1/tenant/extensions/${ext101.id}/mobile-qr`, { token, body: {} });
  record('Mobile QR generate', qr.ok, `HTTP ${qr.status}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
