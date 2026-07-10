# RC3 Telecom Validation Report

| Version | 4.0.0-rc3 |

## Call Flow Stages

| Stage | Component | Validation | Status |
|-------|-----------|------------|--------|
| Inbound PSTN | Telnyx | Carrier health API + webhook secret | ✅ Config |
| SIP ingress | Kamailio :5060/5061 | Dispatcher + permissions | ✅ Config |
| Routing | NestJS `/routing/resolve` | Kamailio HTTP contract | ✅ Wired |
| Business hours / holiday | Tenant time conditions API | DB + runtime | ✅ API |
| IVR | IVR media URI + builder | `IVR_MEDIA_URI` | ⚠️ Needs live URI |
| Queue | Queue runtime + media | `QUEUE_MEDIA_URI` | ⚠️ Needs live URI |
| Extension fork | Kamailio FORK | usrloc + Path | ✅ Wired |
| WebRTC | WSS + enroll | Softphone panel | ✅ RC2 |
| RTP | RTPengine daemon | Prod require flag | ✅ RC3 |
| Recording | Spool → S3 | MinIO + lifecycle | ✅ Config |
| Voicemail | APP_MEDIA relay | `VOICEMAIL_MEDIA_URI` | ⚠️ Needs live URI |
| CDR | CDR module | Postgres | ✅ API |
| Reports | Tenant reports | Admin UI | ✅ Live |

## SIP Methods

| Method | RC2 | RC3 |
|--------|-----|-----|
| INVITE | ✅ | ✅ |
| REGISTER | ✅ | ✅ |
| BYE/CANCEL | ✅ | ✅ |
| **REFER** | ❌ | ✅ |
| OPTIONS | ✅ | ✅ |
| UPDATE/re-INVITE | Partial | Partial |

## WebRTC Checklist

- [x] WSS registration path (Kamailio Path header)
- [x] ICE via enroll `iceServers[]`
- [x] STUN default (`WEBRTC_STUN_URL`)
- [ ] TURN — optional coturn profile
- [x] DTLS-SRTP via rtpengine flags
- [ ] Live MOS measurement — operator test

## Automated Validation

```bash
npm run rc3:validate
npm run kamailio:validate
npm run rtpengine:validate
POST /api/v1/cutover/smoke-test  # includes rtpengine_media
```

## Manual Sign-off (required before GA)

Execute scenarios 1–15 in `02-call-flow-validation.md` on staging with:

- Real Telnyx DID
- `RTPENGINE_ADVERTISE` set
- Two softphones + one PSTN caller
- Confirm audio both directions + recording file in MinIO
