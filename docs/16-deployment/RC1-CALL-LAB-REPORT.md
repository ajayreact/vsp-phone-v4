# RC1 — Call Laboratory Report

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Result | **PENDING** (required for Customer Pilot) |
| Operator | — |
| Staging host | — |

When complete, set `CALL_LAB_RESULT=PASS` (or `FAIL`) and re-run `npm run platform:rc1-validate`.

## Required for Customer Pilot

| Flow | Result | Notes / Call-ID |
|------|--------|-----------------|
| Extension ↔ Extension | PENDING | |
| PSTN Inbound | PENDING | |
| PSTN Outbound | PENDING | |
| SIP Registration | PENDING | |
| Grandstream provisioning | PENDING | |
| Impersonation (start + exit) | PENDING | |
| Device delete + MAC re-enroll | PENDING | Must not see "MAC already enrolled" |

## Required if feature is sold to pilot customer

| Flow | Result | Notes |
|------|--------|-------|
| Voicemail | PENDING | Needs `VOICEMAIL_MEDIA_URI` |
| Recording | PENDING | Needs S3 / recording config |
| Ring Groups | PENDING | |
| IVR | PENDING | Needs `IVR_MEDIA_URI` |
| Caller ID | PENDING | |
| E911 | PENDING | If enabled |

## Document / non-blocking for pilot (track for GA)

| Flow | Result | Notes |
|------|--------|-------|
| Blind Transfer | PENDING | |
| Attended Transfer | PENDING | Not production-proven historically |
| Hold | PENDING | |
| Conference | PENDING | Needs `CONFERENCE_MEDIA_URI` |

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Telecom ops | | | |
| Platform / SRE | | | |
| Product | | | |
