# RC2 Bug Report

| Version | 4.0.0-rc2 |
|---------|-----------|

## Critical

*None identified in application code during RC2 static audit.*

Infrastructure blockers from RC1 (rtpengine daemon, production TLS) remain — see `06-known-issues.md`.

---

## Major

| ID | Component | Description | Repro | Fix / Status |
|----|-----------|-------------|-------|--------------|
| M-RC2-01 | Telecom/RTP | Audio path requires rtpengine daemon in production | Place call without daemon → no RTP | Deploy daemon — **Open** |
| M-RC2-02 | Recording | Recording files not produced without rtpengine recording | Enable policy, no file in MinIO | Enable rtpengine recording — **Open** |
| M-RC2-03 | Transfer | SIP REFER transfer not validated E2E | Blind transfer from softphone | Live Kamailio test — **Open** |
| M-RC2-04 | Tenant Settings | Non-platform settings page is stub | tenant → Settings | Documented — **Accepted** |
| ~~M-RC2-05~~ | Ops Portal | Dead links to `/telnyx-numbers`, `/extensions` | app.vspphone.com dashboard quick links | **Fixed RC2** |
| ~~M-RC2-06~~ | Middleware | `/softphone` redirected to dashboard | Header → Softphone on any portal | **Fixed RC2** |
| ~~M-RC2-07~~ | CORS | Tenant portal blocked from API in production default | tenant login → API calls fail | **Fixed RC2** |

---

## Minor

| ID | Component | Description | Status |
|----|-----------|-------------|--------|
| m-RC2-01 | Ops Infra UI | Redis/Kamailio/Postgres/RTPengine show raw JSON | Open |
| m-RC2-02 | Softphone | Video button disabled (future feature) | By design |
| m-RC2-03 | Header | Fake notification unread dot on empty inbox | **Fixed RC2** |
| m-RC2-04 | Sidebar | Hardcoded "Platform online" status | **Fixed RC2** |
| m-RC2-05 | Next.js | Middleware deprecation warning | Advisory |

---

## Fixed in RC2 (summary)

1. Portal middleware allows `/softphone` on all hostnames
2. Softphone wrapped with `RequireAuth`
3. Ops dashboard cross-portal navigation corrected
4. Notification badge removed when no notifications
5. Sidebar status reflects ops health readiness
6. Production CORS includes tenant portal origin
