#!/usr/bin/env node
/**
 * Tenant Portal V2 production readiness audit (static analysis, local dev only).
 *
 * NOT on release/v4.0.0-rc1 — this file was never committed. For deployed rc1
 * verification use scripts/platform/verify-production-e2e.cjs and /api/health, /api/ready.
 *
 * If present locally: node scripts/tenant-portal-v2-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const BLOCKERS = [
  /coming in the next release/i,
  /Full CRUD coming/i,
  /placeholder only/i,
  /stub implementation/i,
  /TODO:/i,
  /FIXME:/i,
];

const modules = [
  { id: 'dashboard', href: '/dashboard', page: 'apps/admin/src/app/(portal)/dashboard/page.tsx', api: 'tenant-dashboard.controller' },
  { id: 'organization-company', href: '/organization/company', page: 'apps/admin/src/app/(portal)/organization/company/page.tsx', api: 'tenant-organization.controller', component: 'CompanyProfileContent' },
  { id: 'organization-sites', href: '/organization/sites', page: 'apps/admin/src/app/(portal)/organization/sites/page.tsx', api: 'tenant-organization.controller', component: 'SitesContent' },
  { id: 'organization-departments', href: '/organization/departments', page: 'apps/admin/src/app/(portal)/organization/departments/page.tsx', api: 'tenant-organization.controller', component: 'DepartmentsContent' },
  { id: 'users', href: '/people/users', page: 'apps/admin/src/app/(portal)/people/users/page.tsx', api: 'tenant-users.controller' },
  { id: 'extensions', href: '/people/extensions', page: 'apps/admin/src/app/(portal)/people/extensions/page.tsx', api: 'tenant-extensions.controller' },
  { id: 'devices', href: '/people/devices', page: 'apps/admin/src/app/(portal)/people/devices/page.tsx', api: 'tenant-devices.controller' },
  { id: 'provision-employee', href: '/people/provision', page: 'apps/admin/src/app/(portal)/people/provision/page.tsx', api: 'tenant-provision.controller' },
  { id: 'my-numbers', href: '/phone-numbers/my-numbers', page: 'apps/admin/src/app/(portal)/phone-numbers/my-numbers/page.tsx', api: 'tenant-dids.controller' },
  { id: 'number-requests', href: '/phone-numbers/requests', page: 'apps/admin/src/app/(portal)/phone-numbers/requests/page.tsx', api: 'tenant-marketplace.controller' },
  { id: 'did-routing', href: '/phone-numbers/routing', page: 'apps/admin/src/app/(portal)/phone-numbers/routing/page.tsx', api: 'tenant-dids.controller' },
  { id: 'ivr', href: '/call-flow/ivr', page: 'apps/admin/src/app/(portal)/call-flow/ivr/page.tsx', api: 'tenant-ivr.controller' },
  { id: 'ring-groups', href: '/call-flow/ring-groups', page: 'apps/admin/src/app/(portal)/call-flow/ring-groups/page.tsx', api: 'tenant-ring-groups.controller' },
  { id: 'queues', href: '/call-flow/queues', page: 'apps/admin/src/app/(portal)/call-flow/queues/page.tsx', api: 'tenant-queues.controller' },
  { id: 'time-conditions', href: '/call-flow/time-conditions', page: 'apps/admin/src/app/(portal)/call-flow/time-conditions/page.tsx', api: 'tenant-time-conditions.controller' },
  { id: 'holidays', href: '/call-flow/holidays', page: 'apps/admin/src/app/(portal)/call-flow/holidays/page.tsx', api: 'tenant-holiday-calendars.controller' },
  { id: 'incoming-routes', href: '/call-flow/incoming-routes', page: 'apps/admin/src/app/(portal)/call-flow/incoming-routes/page.tsx', api: 'tenant-routing.controller' },
  { id: 'outgoing-routes', href: '/call-flow/outgoing-routes', page: 'apps/admin/src/app/(portal)/call-flow/outgoing-routes/page.tsx', api: 'tenant-routing.controller' },
  { id: 'voicemail', href: '/communication/voicemail', page: 'apps/admin/src/app/(portal)/communication/voicemail/page.tsx', api: 'tenant-voicemail.controller' },
  { id: 'conferences', href: '/communication/conferences', page: 'apps/admin/src/app/(portal)/communication/conferences/page.tsx', api: 'tenant-conferences.controller' },
  { id: 'paging', href: '/communication/paging', page: 'apps/admin/src/app/(portal)/communication/paging/page.tsx', api: 'tenant-paging.controller' },
  { id: 'announcements', href: '/communication/announcements', page: 'apps/admin/src/app/(portal)/communication/announcements/page.tsx', api: 'tenant-audio-library.controller' },
  { id: 'music-on-hold', href: '/communication/music-on-hold', page: 'apps/admin/src/app/(portal)/communication/music-on-hold/page.tsx', api: 'tenant-audio-library.controller' },
  { id: 'cdr', href: '/reports/cdr', page: 'apps/admin/src/app/(portal)/reports/cdr/page.tsx', api: 'tenant-cdr.controller' },
  { id: 'call-recordings', href: '/reports/recordings', page: 'apps/admin/src/app/(portal)/reports/recordings/page.tsx', api: 'tenant-recordings.controller' },
  { id: 'analytics', href: '/reports/analytics', page: 'apps/admin/src/app/(portal)/reports/analytics/page.tsx', api: 'tenant-cdr.controller' },
  { id: 'settings-pbx', href: '/settings/pbx', page: 'apps/admin/src/app/(portal)/settings/pbx/page.tsx', api: 'tenant-organization.controller', component: 'TenantSettingsContent' },
  { id: 'settings-security', href: '/settings/security', page: 'apps/admin/src/app/(portal)/settings/security/page.tsx', api: 'tenant-organization.controller', component: 'TenantSettingsContent' },
  { id: 'settings-api-keys', href: '/settings/api-keys', page: 'apps/admin/src/app/(portal)/settings/api-keys/page.tsx', api: 'tenant-api-keys.controller' },
  { id: 'supervisor', href: '/contact-center/supervisor', page: 'apps/admin/src/app/(portal)/contact-center/supervisor/page.tsx', api: 'supervisor' },
  { id: 'reception', href: '/contact-center/reception', page: 'apps/admin/src/app/(portal)/contact-center/reception/page.tsx', api: 'tenant-reception.controller' },
];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function scanPlaceholders(rel) {
  if (!exists(rel)) return [];
  const content = read(rel);
  return BLOCKERS.filter((re) => re.test(content)).map((re) => re.source);
}

const results = [];
let passCount = 0;
let failCount = 0;

for (const mod of modules) {
  const checks = [];
  let pass = true;

  if (!exists(mod.page)) {
    checks.push(`MISSING page: ${mod.page}`);
    pass = false;
  }

  if (mod.api && mod.api !== 'supervisor') {
    const apiPath = `apps/api/src/modules/tenant-portal/controllers/${mod.api}.ts`;
    const altPath = `apps/api/src/modules/tenant-portal/controllers/${mod.api}`;
    if (!exists(apiPath) && !exists(altPath)) {
      checks.push(`MISSING API controller match: ${mod.api}`);
      pass = false;
    }
  }

  if (mod.component) {
    const compPaths = [
      `apps/admin/src/components/modules/organization/${mod.component}.tsx`,
      `apps/admin/src/components/modules/${mod.component}.tsx`,
    ];
    const comp = compPaths.find(exists);
    if (!comp) {
      checks.push(`MISSING component: ${mod.component}`);
      pass = false;
    } else {
      const hits = scanPlaceholders(comp);
      if (hits.length) {
        checks.push(`PLACEHOLDER in ${comp}: ${hits.join(', ')}`);
        pass = false;
      }
    }
  }

  const pageHits = exists(mod.page) ? scanPlaceholders(mod.page) : [];
  if (pageHits.length) {
    checks.push(`PLACEHOLDER in page: ${pageHits.join(', ')}`);
    pass = false;
  }

  if (pass) passCount++;
  else failCount++;

  results.push({ module: mod.id, href: mod.href, status: pass ? 'PASS' : 'FAIL', notes: checks.join('; ') || 'OK' });
}

// Schema FK check
const schema = read('prisma/schema.prisma');
const fkFields = ['destinationExtensionId', 'destinationVoicemailId', 'destinationConferenceId'];
for (const field of fkFields) {
  const ok = schema.includes(field);
  results.push({
    module: `schema:${field}`,
    href: 'prisma/schema.prisma',
    status: ok ? 'PASS' : 'FAIL',
    notes: ok ? 'OK' : 'Missing InboundRoute FK',
  });
  if (ok) passCount++; else failCount++;
}

// Provision transaction check
const provision = read('apps/api/src/modules/tenant-portal/services/tenant-provision.service.ts');
const txOk = provision.includes('prisma.$transaction') && !provision.includes('platformUsers.create');
results.push({
  module: 'provision-transaction',
  href: 'tenant-provision.service',
  status: txOk ? 'PASS' : 'FAIL',
  notes: txOk ? 'Single DB transaction' : 'Not atomic',
});
if (txOk) passCount++; else failCount++;

// DID dedicated FKs in service
const dids = read('apps/api/src/modules/tenant-portal/services/tenant-dids.service.ts');
const didFkOk =
  dids.includes('destinationVoicemailId') &&
  dids.includes('destinationConferenceId') &&
  dids.includes('destinationExtensionId') &&
  !dids.includes('openHoursDestinationId: row.id');
results.push({
  module: 'inbound-route-dest-fks',
  href: 'tenant-dids.service',
  status: didFkOk ? 'PASS' : 'FAIL',
  notes: didFkOk ? 'Dedicated FKs used' : 'Legacy openHours hack remains',
});
if (didFkOk) passCount++; else failCount++;

console.log('\n# Tenant Portal V2 Production Readiness Report\n');
console.log('| Module | Route | Status | Notes |');
console.log('|--------|-------|--------|-------|');
for (const r of results) {
  console.log(`| ${r.module} | ${r.href} | **${r.status}** | ${r.notes} |`);
}
console.log(`\n**Summary:** ${passCount} PASS / ${failCount} FAIL\n`);

const reportPath = path.join(root, 'docs/tenant-portal-v2-readiness-report.md');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
  reportPath,
  `# Tenant Portal V2 Production Readiness Report\n\nGenerated: ${new Date().toISOString()}\n\n| Module | Route | Status | Notes |\n|--------|-------|--------|-------|\n${results.map((r) => `| ${r.module} | ${r.href} | ${r.status} | ${r.notes} |`).join('\n')}\n\n**Summary:** ${passCount} PASS / ${failCount} FAIL\n`,
);
console.log(`Report written to ${reportPath}`);

process.exit(failCount > 0 ? 1 : 0);
