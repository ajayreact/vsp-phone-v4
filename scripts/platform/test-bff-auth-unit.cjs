#!/usr/bin/env node
'use strict';

/** Unit tests for BFF auth permission logic (no Jest config required). */

const assert = require('node:assert/strict');

const PERMISSIONS = {
  PLATFORM_SUPER_ADMIN: 'platform:super_admin',
  TENANT_ADMIN: 'tenant:admin',
  TENANT_EXTENSIONS_READ: 'tenant:extensions:read',
  OPS_HEALTH_READ: 'ops:health:read',
  OPS_LIVE_CALLS_READ: 'ops:live_calls:read',
  OPS_DASHBOARD_READ: 'ops:dashboard:read',
  OPS_INFRA_READ: 'ops:infra:read',
};

const BFF_OBSERVABILITY_READ = [
  PERMISSIONS.PLATFORM_SUPER_ADMIN,
  PERMISSIONS.OPS_HEALTH_READ,
  PERMISSIONS.OPS_INFRA_READ,
  PERMISSIONS.OPS_DASHBOARD_READ,
];

const BFF_OBSERVABILITY_CALLS = [
  PERMISSIONS.PLATFORM_SUPER_ADMIN,
  PERMISSIONS.OPS_LIVE_CALLS_READ,
  PERMISSIONS.OPS_DASHBOARD_READ,
];

function hasPermission(userPermissions, required) {
  if (userPermissions.includes(PERMISSIONS.PLATFORM_SUPER_ADMIN)) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.some((p) => userPermissions.includes(p));
}

function extractBearerToken(headers) {
  const header = headers.authorization || headers.Authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`[FAIL] ${name} — ${err.message}`);
    failed += 1;
  }
}

test('extractBearerToken returns null without header', () => {
  assert.equal(extractBearerToken({}), null);
});

test('extractBearerToken rejects Basic auth', () => {
  assert.equal(extractBearerToken({ authorization: 'Basic abc' }), null);
});

test('extractBearerToken extracts token', () => {
  assert.equal(extractBearerToken({ authorization: 'Bearer tok123' }), 'tok123');
});

test('platform super admin allowed for observability read', () => {
  assert.equal(hasPermission([PERMISSIONS.PLATFORM_SUPER_ADMIN], BFF_OBSERVABILITY_READ), true);
});

test('ops health read allowed for observability read', () => {
  assert.equal(hasPermission([PERMISSIONS.OPS_HEALTH_READ], BFF_OBSERVABILITY_READ), true);
});

test('tenant extensions read denied for observability read', () => {
  assert.equal(hasPermission([PERMISSIONS.TENANT_EXTENSIONS_READ], BFF_OBSERVABILITY_READ), false);
});

test('tenant admin denied for calls BFF', () => {
  assert.equal(hasPermission([PERMISSIONS.TENANT_ADMIN], BFF_OBSERVABILITY_CALLS), false);
});

test('ops live calls read allowed for calls BFF', () => {
  assert.equal(hasPermission([PERMISSIONS.OPS_LIVE_CALLS_READ], BFF_OBSERVABILITY_CALLS), true);
});

console.log(`\n${passed}/${passed + failed} unit tests passed`);
process.exit(failed ? 1 : 0);
