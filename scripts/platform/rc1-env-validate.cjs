#!/usr/bin/env node
'use strict';

/**
 * Phase 2 — Environment validation (presence only; never prints secret values).
 * Fail-fast when required keys are missing for the selected profile.
 *
 *   node scripts/platform/rc1-env-validate.cjs
 *   RC1_PROFILE=production node scripts/platform/rc1-env-validate.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const PROFILE = (process.env.RC1_PROFILE || process.env.VSP_ENV || 'development').toLowerCase();
const REPORT_PATH =
  process.env.RC1_ENV_REPORT_PATH ||
  path.resolve(process.cwd(), 'docs/16-deployment/RC1-ENV-VALIDATION-REPORT.md');

/** @type {{ key: string, required: boolean | 'prod' | 'recording' | 'media' | 'smtp', note?: string }[]} */
const CHECKS = [
  { key: 'DATABASE_URL', required: true },
  { key: 'REDIS_URL', required: true },
  { key: 'JWT_SECRET', required: 'prod', note: 'DEV_JWT_SECRET accepted in non-prod only' },
  { key: 'DEV_JWT_SECRET', required: false, note: 'lab only — forbidden in production' },
  { key: 'TELNYX_API_KEY', required: 'prod' },
  { key: 'TELNYX_WEBHOOK_SECRET', required: 'prod' },
  { key: 'TELNYX_API_BASE_URL', required: false },
  { key: 'VSP_PLATFORM_INVENTORY_TENANT_ID', required: 'prod' },
  { key: 'TELECOM_SERVICE_AUTH_TOKEN', required: 'prod' },
  { key: 'CORS_ORIGINS', required: 'prod' },
  { key: 'BACKUP_LOCATION', required: 'prod' },
  { key: 'SMTP_HOST', required: 'prod', note: 'RC1 exit — SMTP required for production' },
  { key: 'SMTP_FROM_EMAIL', required: 'prod' },
  { key: 'SMTP_PORT', required: false },
  { key: 'KAMAILIO_WSS_PORT', required: 'prod' },
  { key: 'KAMAILIO_REQUIRE_SERVICE_AUTH', required: 'prod' },
  { key: 'RTPENGINE_HOST', required: 'prod' },
  { key: 'RTPENGINE_NG_PORT', required: 'prod' },
  { key: 'SIP_PLATFORM_DOMAIN', required: 'prod' },
  { key: 'WEBRTC_WSS_URL', required: 'prod', note: 'softphone / WebRTC' },
  { key: 'WEBRTC_STUN_URL', required: false },
  { key: 'WEBRTC_TURN_URL', required: false },
  { key: 'QUEUE_MEDIA_URI', required: 'media' },
  { key: 'IVR_MEDIA_URI', required: 'media' },
  { key: 'CONFERENCE_MEDIA_URI', required: 'media' },
  { key: 'VOICEMAIL_MEDIA_URI', required: 'media' },
  { key: 'S3_BUCKET_RECORDINGS', required: 'recording' },
  { key: 'S3_ACCESS_KEY', required: 'recording' },
  { key: 'S3_SECRET_KEY', required: 'recording' },
  { key: 'S3_REGION', required: 'recording' },
  { key: 'S3_ENDPOINT', required: false },
  { key: 'PROV_PUBLIC_BASE_URL', required: 'prod', note: 'Grandstream / desk phone provisioning URL' },
];

function present(key) {
  const v = process.env[key];
  return Boolean(v && String(v).trim());
}

function isRequired(rule) {
  if (rule === true) return true;
  if (rule === false) return false;
  if (rule === 'prod') return PROFILE === 'production' || PROFILE === 'prod';
  if (rule === 'recording') {
    return process.env.RECORDING_ENABLED === 'true' || process.env.RECORDING_UPLOAD_ENABLED === 'true';
  }
  if (rule === 'media') {
    return process.env.RC1_REQUIRE_MEDIA === '1' || process.env.RC1_REQUIRE_MEDIA === 'true';
  }
  if (rule === 'smtp') {
    // Production always requires SMTP; non-prod opt-in via RC1_REQUIRE_SMTP
    if (PROFILE === 'production' || PROFILE === 'prod') return true;
    return process.env.RC1_REQUIRE_SMTP === '1' || process.env.RC1_REQUIRE_SMTP === 'true';
  }
  return false;
}

function main() {
  const rows = [];
  const missing = [];
  const warnings = [];

  for (const c of CHECKS) {
    const ok = present(c.key);
    // JWT: non-prod may use DEV_JWT_SECRET
    let effectiveOk = ok;
    if (c.key === 'JWT_SECRET' && !ok && present('DEV_JWT_SECRET') && PROFILE !== 'production') {
      effectiveOk = true;
    }
    const req = isRequired(c.required);
    const status = effectiveOk ? 'SET' : req ? 'MISSING' : 'OPTIONAL_UNSET';
    if (status === 'MISSING') missing.push(c.key);
    if (status === 'OPTIONAL_UNSET' && (c.required === 'media' || c.key === 'WEBRTC_WSS_URL')) {
      warnings.push(`${c.key} unset (${c.note || c.required})`);
    }
    rows.push({ key: c.key, status, required: req, note: c.note || '' });
  }

  // Dangerous prod flags
  if (PROFILE === 'production' || PROFILE === 'prod') {
    for (const bad of ['DEV_AUTH_EMAIL', 'DEV_AUTH_PASSWORD', 'DEV_JWT_SECRET', 'MIGRATION_DEV_SUPER_ADMIN']) {
      if (present(bad) && bad !== 'MIGRATION_DEV_SUPER_ADMIN') {
        missing.push(`${bad} must not be set in production`);
      }
      if (bad === 'MIGRATION_DEV_SUPER_ADMIN' && process.env.MIGRATION_DEV_SUPER_ADMIN === 'true') {
        missing.push('MIGRATION_DEV_SUPER_ADMIN=true forbidden in production');
      }
    }
  }

  const ok = missing.length === 0;
  const md = [
    '# RC1 — Environment Validation Report',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Generated | ${new Date().toISOString()} |`,
    `| Profile | ${PROFILE} |`,
    `| Result | ${ok ? 'PASS' : 'FAIL'} |`,
    '',
    '| Variable | Status | Required | Note |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.key} | ${r.status} | ${r.required} | ${r.note} |`),
    '',
    '## Failures',
    '',
    missing.length ? missing.map((m) => `- ${m}`).join('\n') : '- None',
    '',
    '## Warnings',
    '',
    warnings.length ? warnings.map((w) => `- ${w}`).join('\n') : '- None',
    '',
    'Secret values are never printed. Set `RC1_PROFILE=production` for prod gates.',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, md, 'utf8');
  console.log(md);
  console.log(`Wrote ${REPORT_PATH}`);

  if (!ok) {
    console.error('\nENV VALIDATION FAILED — fix missing required configuration');
    process.exit(1);
  }
  console.log('\nENV VALIDATION PASSED');
  process.exit(0);
}

main();
