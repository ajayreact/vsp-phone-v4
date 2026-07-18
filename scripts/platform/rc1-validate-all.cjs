#!/usr/bin/env node
'use strict';

/**
 * RC1 master validation orchestrator (Phases 1–6 automated portions).
 *
 *   node scripts/platform/rc1-validate-all.cjs
 *
 * Env:
 *   API_BASE, PLATFORM_EMAIL, PLATFORM_PASSWORD — for smoke/load
 *   SKIP_SMOKE=1, SKIP_LOAD=1, SKIP_SECURITY=1
 *   RC1_PROFILE=production|development
 */

const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const ROOT = process.cwd();
const REPORT_PATH = path.resolve(ROOT, 'docs/16-deployment/RC1-RELEASE-CANDIDATE-REPORT.md');

const phases = [];

function runNode(script, env = {}) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return {
    code: r.status ?? 1,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function phase(name, fn) {
  console.log(`\n========== ${name} ==========`);
  try {
    const result = fn();
    phases.push({ name, ...result });
    console.log(`[${result.status}] ${name}`);
  } catch (err) {
    phases.push({ name, status: 'FAIL', detail: err.message });
    console.log(`[FAIL] ${name} — ${err.message}`);
  }
}

function main() {
  // Phase 1
  phase('Phase 1 — Infrastructure', () => {
    const r = runNode('scripts/platform/rc1-infrastructure-validate.cjs');
    return {
      status: r.code === 0 ? 'PASS' : 'FAIL',
      detail: r.code === 0 ? 'See RC1-INFRASTRUCTURE-REPORT.md' : extractFail(r),
      exitCode: r.code,
    };
  });

  // Phase 2
  phase('Phase 2 — Environment', () => {
    const r = runNode('scripts/platform/rc1-env-validate.cjs');
    return {
      status: r.code === 0 ? 'PASS' : 'FAIL',
      detail: r.code === 0 ? 'See RC1-ENV-VALIDATION-REPORT.md' : extractFail(r),
      exitCode: r.code,
    };
  });

  // Phase 3
  phase('Phase 3 — Pilot smoke', () => {
    if (process.env.SKIP_SMOKE === '1') {
      return { status: 'SKIP', detail: 'SKIP_SMOKE=1' };
    }
    if (!process.env.PLATFORM_EMAIL && !process.env.SUPER_ADMIN_EMAIL) {
      return {
        status: 'BLOCKED',
        detail: 'PLATFORM_EMAIL / PLATFORM_PASSWORD not set — cannot reach API smoke',
      };
    }
    const r = runNode('scripts/platform/staging-pilot-smoke.cjs', {
      SKIP_LIVE_CALLS: process.env.SKIP_LIVE_CALLS ?? '1',
    });
    return {
      status: r.code === 0 ? 'PASS' : 'FAIL',
      detail: r.code === 0 ? 'See STAGING-PILOT-SMOKE-REPORT.md' : extractFail(r),
      exitCode: r.code,
    };
  });

  // Phase 4 — call lab is manual; mark blocked unless CALL_LAB_RESULT provided
  phase('Phase 4 — Call laboratory', () => {
    const lab = (process.env.CALL_LAB_RESULT || '').toUpperCase();
    if (lab === 'PASS' || lab === 'FAIL') {
      return { status: lab, detail: 'CALL_LAB_RESULT from operator' };
    }
    return {
      status: 'BLOCKED',
      detail: 'Requires live Kamailio/Telnyx lab — see RC1-CALL-LAB-REPORT.md',
    };
  });

  // Phase 5
  phase('Phase 5 — Load testing', () => {
    if (process.env.SKIP_LOAD === '1') {
      return { status: 'SKIP', detail: 'SKIP_LOAD=1' };
    }
    if (!process.env.PLATFORM_EMAIL && !process.env.SUPER_ADMIN_EMAIL) {
      return {
        status: 'BLOCKED',
        detail: 'PLATFORM_EMAIL / PLATFORM_PASSWORD not set',
      };
    }
    const r = runNode('scripts/platform/pilot-load-test.cjs');
    return {
      status: r.code === 0 ? 'PASS' : r.code === 2 ? 'BLOCKED' : 'FAIL',
      detail: r.code === 0 ? 'See PERFORMANCE-REPORT.md' : extractFail(r),
      exitCode: r.code,
    };
  });

  // Phase 6
  phase('Phase 6 — Security tests', () => {
    if (process.env.SKIP_SECURITY === '1') {
      return { status: 'SKIP', detail: 'SKIP_SECURITY=1' };
    }
    try {
      execSync(
        'npx nx test api --testPathPattern="portal-auth|tenant.util|marketplace-inventory|inventory-tenant-hard-fail|tenant-devices-mac-cleanup" --skip-nx-cache',
        { cwd: ROOT, stdio: 'inherit', env: process.env },
      );
      return { status: 'PASS', detail: 'Security unit/integration suites green' };
    } catch {
      return { status: 'FAIL', detail: 'Security test suite failed' };
    }
  });

  // Phase 7 — docs checklist (static)
  phase('Phase 7 — Operational readiness docs', () => {
    const required = [
      'docs/16-deployment/ROLLBACK.md',
      'docs/16-deployment/PREPROD-CLEANUP.md',
      'docs/16-deployment/AWS-DEPLOYMENT-CHECKLIST.md',
      'docs/16-deployment/FEATURE-FREEZE.md',
      'docs/16-deployment/RC1-OPERATIONAL-READINESS.md',
      'docs/16-deployment/RC1-EXIT-CRITERIA.md',
      'docs/16-deployment/OPERATIONS-RUNBOOK.md',
      'docs/16-deployment/RC1-GOVERNANCE.md',
    ];
    const missing = required.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    return {
      status: missing.length ? 'FAIL' : 'PASS',
      detail: missing.length
        ? `Missing: ${missing.join(', ')}`
        : 'Governance + exit criteria + runbook + freeze present',
    };
  });

  const classification = classify(phases);
  writeMasterReport(phases, classification);
  console.log(`\n=== RC1 CLASSIFICATION: ${classification} ===\n`);
  process.exit(classification.includes('Rejected') ? 1 : 0);
}

function classify(phases) {
  const by = Object.fromEntries(phases.map((p) => [p.name, p.status]));
  const security = by['Phase 6 — Security tests'];
  const ops = by['Phase 7 — Operational readiness docs'];
  const infra = by['Phase 1 — Infrastructure'];
  const env = by['Phase 2 — Environment'];
  const smoke = by['Phase 3 — Pilot smoke'];
  const calls = by['Phase 4 — Call laboratory'];
  const load = by['Phase 5 — Load testing'];

  if (security === 'FAIL' || ops === 'FAIL') return 'RC Rejected';

  // GA requires Customer Pilot gates + load + explicit CALL_LAB_RESULT=PASS + optional soak flag
  const soakOk =
    process.env.RC1_SOAK_14_DAYS === '1' ||
    process.env.RC1_SOAK_14_DAYS === 'true' ||
    process.env.RC1_SOAK_14_DAYS === 'PASS';

  if (
    infra === 'PASS' &&
    env === 'PASS' &&
    smoke === 'PASS' &&
    calls === 'PASS' &&
    load === 'PASS' &&
    security === 'PASS' &&
    soakOk
  ) {
    return 'RC Approved for General Availability';
  }

  // Customer Pilot: infra + env + smoke + live PBX (call lab) + security
  if (
    infra === 'PASS' &&
    env === 'PASS' &&
    smoke === 'PASS' &&
    calls === 'PASS' &&
    security === 'PASS'
  ) {
    return 'RC Approved for Customer Pilot';
  }

  if (security === 'PASS' && ops === 'PASS') {
    return 'RC Approved for Internal Testing';
  }
  return 'RC Rejected';
}

function extractFail(r) {
  const text = `${r.stderr}\n${r.stdout}`.trim();
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-3).join(' | ').slice(0, 240) || `exit ${r.code}`;
}

function writeMasterReport(phases, classification) {
  const md = [
    '# VSP Phone 5 — RC1 Release Candidate Report',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${new Date().toISOString()} |`,
    `| Classification | **${classification}** |`,
    `| Feature freeze | ACTIVE — stability / security / deploy only |`,
    '',
    '## Phase summary',
    '',
    '| Phase | Status | Detail |',
    '|---|---|---|',
    ...phases.map(
      (p) =>
        `| ${p.name} | ${p.status} | ${String(p.detail || '').replace(/\|/g, '/')} |`,
    ),
    '',
    '## Linked reports',
    '',
    '- [Governance](./RC1-GOVERNANCE.md)',
    '- [Exit criteria](./RC1-EXIT-CRITERIA.md)',
    '- [Operations runbook](./OPERATIONS-RUNBOOK.md)',
    '- [Infrastructure](./RC1-INFRASTRUCTURE-REPORT.md)',
    '- [Environment](./RC1-ENV-VALIDATION-REPORT.md)',
    '- [Smoke](./STAGING-PILOT-SMOKE-REPORT.md)',
    '- [Call lab](./RC1-CALL-LAB-REPORT.md)',
    '- [Performance](./PERFORMANCE-REPORT.md)',
    '- [Security](./RC1-SECURITY-REPORT.md)',
    '- [Feature freeze](./FEATURE-FREEZE.md)',
    '- [Rollback](./ROLLBACK.md)',
    '- [AWS checklist](./AWS-DEPLOYMENT-CHECKLIST.md)',
    '',
    '## Classification rules',
    '',
    '- **RC Rejected** — security or ops docs fail',
    '- **RC Approved for Internal Testing** — security + freeze/ops (current until staging cert)',
    '- **RC Approved for Customer Pilot** — infra + env + smoke + CALL_LAB_RESULT=PASS + security',
    '- **RC Approved for General Availability** — Customer Pilot + load + RC1_SOAK_14_DAYS=PASS',
    '',
    '## Next actions',
    '',
    classification.includes('Internal')
      ? [
          'Follow docs/16-deployment/RC1-EXIT-CRITERIA.md and OPERATIONS-RUNBOOK.md on staging.',
          '1. Fix Postgres/Redis; migrate deploy; platform:rc1-infra.',
          '2. RC1_PROFILE=production platform:rc1-env (must PASS).',
          '3. platform:pilot-smoke with PLATFORM_EMAIL / PASSWORD / API_BASE.',
          '4. Complete call lab → CALL_LAB_RESULT=PASS.',
          '5. Re-run platform:rc1-validate — expect Customer Pilot.',
        ].join('\n')
      : classification.includes('Customer Pilot')
        ? 'Customer Pilot gate met. Run load tests and start 14-day soak before GA.'
        : classification.includes('General Availability')
          ? 'All gates including 14-day soak passed. Proceed with GA checklist.'
          : 'Address FAIL phases before re-running `npm run platform:rc1-validate`.',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, md, 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);
}

main();
