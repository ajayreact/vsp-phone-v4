#!/usr/bin/env node
'use strict';

/** Read-only production probe — no mutations. */

const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = (process.env.API_BASE || 'https://api.vspphone.com/api').replace(/\/$/, '');
const EMAIL = process.env.PLATFORM_EMAIL || process.env.SUPER_ADMIN_EMAIL || '';
const PASSWORD = process.env.PLATFORM_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || '';

async function api(method, p, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json };
}

function unwrap(r) { return r.json?.data ?? r.json; }

(async () => {
  console.log('API', API_BASE);
  const health = await api('GET', '/health');
  console.log('health', health.status, health.json?.status);

  const login = await api('POST', '/v1/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = unwrap(login)?.accessToken;
  console.log('platform login', login.status, Boolean(token));

  const endpoints = [
    '/v1/tenant/extensions/hub',
    '/v1/tenant/extensions/hub/stats',
    '/v1/carriers/telnyx/numbers/dashboard',
    '/v1/carriers/telnyx/numbers/requests',
  ];
  for (const ep of endpoints) {
    const r = await api('GET', ep, { token });
    console.log(ep, '→', r.status, r.ok ? 'OK' : (r.json?.message || r.json?.raw || ''));
  }

  const tenants = unwrap(await api('GET', '/v1/platform/tenants', { token })) || [];
  console.log('tenants', tenants.length);
})();
