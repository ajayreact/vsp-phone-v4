# RC1 — Environment Validation Report

| Field | Value |
|-------|-------|
| Generated | 2026-07-16T22:56:15.802Z |
| Profile | production |
| Result | FAIL |

| Variable | Status | Required | Note |
|---|---|---|---|
| DATABASE_URL | SET | true |  |
| REDIS_URL | SET | true |  |
| JWT_SECRET | SET | true | DEV_JWT_SECRET accepted in non-prod only |
| DEV_JWT_SECRET | OPTIONAL_UNSET | false | lab only — forbidden in production |
| TELNYX_API_KEY | MISSING | true |  |
| TELNYX_WEBHOOK_SECRET | SET | true |  |
| TELNYX_API_BASE_URL | SET | false |  |
| VSP_PLATFORM_INVENTORY_TENANT_ID | MISSING | true |  |
| TELECOM_SERVICE_AUTH_TOKEN | SET | true |  |
| CORS_ORIGINS | MISSING | true |  |
| BACKUP_LOCATION | SET | true |  |
| SMTP_HOST | MISSING | true | RC1 exit — SMTP required for production |
| SMTP_FROM_EMAIL | MISSING | true |  |
| SMTP_PORT | OPTIONAL_UNSET | false |  |
| KAMAILIO_WSS_PORT | SET | true |  |
| KAMAILIO_REQUIRE_SERVICE_AUTH | SET | true |  |
| RTPENGINE_HOST | SET | true |  |
| RTPENGINE_NG_PORT | SET | true |  |
| SIP_PLATFORM_DOMAIN | SET | true |  |
| WEBRTC_WSS_URL | SET | true | softphone / WebRTC |
| WEBRTC_STUN_URL | SET | false |  |
| WEBRTC_TURN_URL | OPTIONAL_UNSET | false |  |
| QUEUE_MEDIA_URI | SET | false |  |
| IVR_MEDIA_URI | SET | false |  |
| CONFERENCE_MEDIA_URI | SET | false |  |
| VOICEMAIL_MEDIA_URI | SET | false |  |
| S3_BUCKET_RECORDINGS | SET | true |  |
| S3_ACCESS_KEY | SET | true |  |
| S3_SECRET_KEY | SET | true |  |
| S3_REGION | SET | true |  |
| S3_ENDPOINT | SET | false |  |
| PROV_PUBLIC_BASE_URL | SET | true | Grandstream / desk phone provisioning URL |

## Failures

- TELNYX_API_KEY
- VSP_PLATFORM_INVENTORY_TENANT_ID
- CORS_ORIGINS
- SMTP_HOST
- SMTP_FROM_EMAIL
- MIGRATION_DEV_SUPER_ADMIN=true forbidden in production

## Warnings

- None

Secret values are never printed. Set `RC1_PROFILE=production` for prod gates.
