# Defect — RC1 Promotion Blocker

| Field | Value |
|-------|-------|
| Date | 2026-07-17 |
| ID | **ENV-04** |
| Severity | **P0 (Critical)** |
| Failing command | `RC1_PROFILE=production npm run platform:rc1-env` |
| Environment | AWS EC2 `/opt/vsp-phone-v4` |
| Category | Environment configuration |
| Status | **Open** |
| Application code change | **None** |

## Symptom

```text
ENV VALIDATION FAILED — fix missing required configuration

## Failures
- CORS_ORIGINS
- SMTP_HOST
- SMTP_FROM_EMAIL
```

Report written: `docs/16-deployment/RC1-ENV-VALIDATION-REPORT.md` on the server.

## Root cause

Production-profile RC1 env gate requires these variables. They are unset (or empty) in the EC2 `.env` used by the validator.

Other checked keys (WebRTC, S3, provisioning URL, etc.) were SET.

## Minimum recovery (operator — `.env` on EC2 only)

Edit `/opt/vsp-phone-v4/.env` and set (use your real values):

```bash
# Browser origins allowed to call the API (comma-separated, no spaces preferred)
CORS_ORIGINS=https://admin.vspphone.com,https://app.vspphone.com,https://tenant.vspphone.com

# Outbound email
SMTP_HOST=smtp.example.com
SMTP_FROM_EMAIL=noreply@vspphone.com
# Recommended also (not always hard-required by the script, but needed for real mail):
# SMTP_PORT=587
# SMTP_USERNAME=...
# SMTP_PASSWORD=...
# SMTP_USE_TLS=true
```

Adjust hostnames to your actual admin/tenant portals. If you use a single origin, one URL is enough.

Then **rerun only the failed command**:

```bash
cd /opt/vsp-phone-v4
RC1_PROFILE=production npm run platform:rc1-env
```

Do not skip ahead until this exits 0.

## After PASS

```bash
API_BASE=https://api.vspphone.com/api \
PLATFORM_EMAIL=<admin> \
PLATFORM_PASSWORD=<password> \
npm run platform:pilot-smoke
```
