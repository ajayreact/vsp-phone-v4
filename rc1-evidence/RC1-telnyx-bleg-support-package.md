# Telnyx Support Package — Missing Outbound B-Leg (`telnyx_cc_app`)

**Product:** Elastic SIP Trunking (Credential Authentication)  
**Issue:** Outbound call presents A-leg `180 Ringing` to customer but PSTN destination never rings; Telnyx API shows **no outbound B-leg** created.  
**Platform status:** Our Kamailio / RoutingService / RTPengine / authentication path is verified working via packet capture and Telnyx CDR correlation.

**Root cause (identified):** Telnyx SIP Connection `VSP-SIP-Trunk` had **`outbound.call_parking_enabled: true`**. With call parking enabled, Telnyx parks outbound SIP-trunk INVITEs (returns A-leg `180`, no auto-bridge to PSTN) and waits for Voice API / TeXML dial+bridge commands via webhook. Our path is direct Kamailio SIP trunking — we do not issue those commands — so the `telnyx_cc_app` B-leg was never created.

**Fix applied:** `PATCH /v2/credential_connections/2982156817053779933` with `{"outbound":{"call_parking_enabled":false}}` via `rc1-evidence/fix-telnyx-call-parking.sh`.

---

## 1. Call identifiers (please correlate in Mission Control)

| Field | Value |
|-------|-------|
| **SIP Call-ID** | `TLYEOszuw35OP26ZLqtjCg..` |
| **Telnyx Session ID** | `9a673e20-885b-11f1-9f61-02420aef93a0` |
| **SIP Trunking Leg ID** | `9a674ce4-885b-11f1-8b7b-02420aef93a0` |
| **FS Channel ID** | `885f1ddd-a1e8-4636-81de-f6f21a405ae7` |
| **X-Telnyx-Session-ID** (SIP header) | `9a673e20-885b-11f1-9f61-02420aef93a0` |
| **X-Telnyx-Leg-ID** (SIP header on 180) | `9a674ce4-885b-11f1-8b7b-02420aef93a0` |
| **UTC time window** | **2026-07-25 19:04:03 – 19:04:20** |
| **Caller (CLI)** | `+13136506292` (Extension 100) |
| **Destination (CLD)** | `+18648082167` |
| **Auth username** | `userinfo26316` |
| **SIP Connection** | `VSP-SIP-Trunk` — ID `2982156817053779933` |
| **Connection type** | `credential-authentication` |
| **Outbound Voice Profile** | `VSP-Outbound` — ID `2982164000495633730` |
| **Platform UUID** (internal correlation) | `eb3f3910-06ce-42e6-a2c9-f632e4deecf3` |

---

## 2. Executive summary

We placed an outbound SIP-trunk call from our platform to `+18648082167`. Wire capture and Telnyx Detail Records confirm:

- SIP digest authentication to Telnyx **succeeds** on CSeq 2 retry.
- Caller ID rewrite to E.164 `+13136506292` **succeeds** (`From`, `P-Asserted-Identity`).
- Telnyx **accepts** the authenticated INVITE, performs LRN lookup, selects route `Inter`.
- Telnyx returns **`180 Ringing`** on the A-leg at **+285 ms** (signal-only, no SDP).
- **No** `183 Session Progress`, **no** `200 OK`, **no** RTP.
- Telnyx Session Analysis and CDRs show **only one leg** (`telnyx_connection`, inbound) — **no outbound `telnyx_cc_app` B-leg**.
- `attempted=1`, `connected=0`; call ends with `ORIGINATOR_CANCEL` after our SIP client sends CANCEL (~17 s).
- Historical calls to the **same destination** consistently show **two legs** (inbound + outbound), including cancelled calls — proving the missing B-leg on this call is **abnormal**.

We request Telnyx explain why the outbound PSTN B-leg was never instantiated and why A-leg `180` was sent before B-leg creation.

---

## 3. A-leg SIP ladder (captured on our edge — Kamailio ↔ Telnyx ↔ Zoiper)

**Capture:** `/tmp/telnyx-fix-validation.pcap` on production edge (filter: Telnyx + client IP)  
**Call-ID:** `TLYEOszuw35OP26ZLqtjCg..`

| # | Time (UTC) | Direction | Message | Notes |
|---|------------|-----------|---------|-------|
| 1 | 19:04:03.411 | Zoiper → Kamailio | INVITE | CSeq 1 |
| 2 | 19:04:03.526 | Kamailio → Zoiper | 100 Trying | |
| 3 | 19:04:03.530 | Kamailio → Telnyx | INVITE | CSeq 1, no auth |
| 4 | 19:04:03.573 | Telnyx → Kamailio | 100 Trying | |
| 5 | 19:04:03.743 | Telnyx → Kamailio | 407 Proxy Authentication Required | Expected |
| 6 | 19:04:03.744 | Kamailio → Telnyx | ACK | CSeq 1 |
| 7 | 19:04:03.744 | Kamailio → Telnyx | INVITE | CSeq 2, `Proxy-Authorization`, CLI `+13136506292` |
| 8 | 19:04:03.787 | Telnyx → Kamailio | 100 Trying | |
| 9 | **19:04:04.030** | **Telnyx → Kamailio** | **180 Ringing** | `Content-Length: 0`, To-tag `BKN9mrS5rmF4B`, +285 ms after auth INVITE |
| 10 | 19:04:04.030 | Kamailio → Zoiper | 180 Ringing | Relayed unchanged |
| — | *19:04:04 – 19:04:20* | — | *No further progress* | No 183, PRACK, 200 OK, BYE |
| 11 | **19:04:20.913** | **Zoiper → Kamailio** | **CANCEL** | User-Agent: Zoiper |
| 12 | 19:04:20.916 | Kamailio → Telnyx | CANCEL | |
| 13 | 19:04:20.916 | Kamailio → Zoiper | 200 canceling | |
| 14 | 19:04:20.959 | Telnyx → Kamailio | 200 canceling | |
| 15 | 19:04:21.021 | Telnyx → Kamailio | 487 Request Terminated | |
| 16 | 19:04:21.022 | Kamailio → Telnyx | ACK | |
| 17 | 19:04:21.022 | Kamailio → Zoiper | 487 Request Terminated | |
| 18 | 19:04:21.275 | Zoiper → Kamailio | ACK | |

**Not observed:** `183 Session Progress`, `PRACK`, `200 OK` (INVITE), media RTP, `BYE`.

**Authenticated INVITE headers (excerpt):**

```
From: Extension 100 <sip:+13136506292@sip.vspphone.com>
P-Asserted-Identity: <sip:+13136506292@sip.vspphone.com>
Request-URI: sip:+18648082167@sip.telnyx.com
Proxy-Authorization: Digest username="userinfo26316" ...
```

**Telnyx `180 Ringing` (excerpt):**

```
SIP/2.0 180 Ringing
To: <sip:18648082167@sip.vspphone.com>;tag=BKN9mrS5rmF4B
Content-Length: 0
X-Telnyx-Session-ID: 9a673e20-885b-11f1-9f61-02420aef93a0
X-Telnyx-Leg-ID: 9a674ce4-885b-11f1-8b7b-02420aef93a0
Contact: <sip:18648082167@10.231.144.68:5070;transport=udp>
```

---

## 4. Telnyx Detail Record (sip-trunking)

Queried via `GET /v2/detail_records?filter[record_type]=sip-trunking&filter[id]=9a674ce4-885b-11f1-8b7b-02420aef93a0`

| Field | Value |
|-------|-------|
| `sip_call_id` | `TLYEOszuw35OP26ZLqtjCg..` |
| `telnyx_session_id` | `9a673e20-885b-11f1-9f61-02420aef93a0` |
| `direction` | `outbound` |
| `cli` / `cld` | `+13136506292` / `+18648082167` |
| `started_at` / `finished_at` | `2026-07-25T19:04:03Z` / `2026-07-25T19:04:20Z` |
| `attempted` | **1** |
| `connected` | **0** |
| `completed` | **0** |
| `answered_at` | *null* |
| `call_sec` / `billed_sec` | **0** / **0** |
| `route` | `Inter` |
| `lrn` | `8646861999` |
| `term_lrn_state` / `city` / `ocn` / `lata` | SC / CLINTON / 515J / GREENVILLE SC |
| `orig_lrn` | `3132093080` (Detroit MI) |
| `shaken_stir` | `A` |
| `onnet` | `false` |
| `flow_dest` | `non_telnyx_pstn_number` |
| `flow_source` | `telnyx_connection` |
| `leg_direction` | `inbound` *(Telnyx perspective — customer A-leg)* |
| `hangup_cause` | `ORIGINATOR_CANCEL` |
| `hangup_details` | `recv_cancel` |
| `hangup_code` | **16** *(Q.850 Normal Clearing)* |
| `sip_invite_failure_status` | `487` |
| `telnyx_error_code` | `D00` |
| `has_telnyx_retried_internally` | `false` |
| `rtp_use_codec_name` | *(empty — no media)* |
| `connection_id` | `2982156817053779933` |
| `outbound_profile_id` | `2982164000495633730` |

---

## 5. Session Analysis — missing B-leg (critical)

Queried via `GET /v2/session_analysis/call-session/9a673e20-885b-11f1-9f61-02420aef93a0?max_depth=5&expand=record&date_time=2026-07-25T19:04:03Z`

**This call (FAILED — missing B-leg):**

```
call-session 9a673e20-885b-11f1-9f61-02420aef93a0
└── sip-trunking 9a674ce4-885b-11f1-8b7b-02420aef93a0
      flow_source=telnyx_connection
      leg_direction=inbound
      connected=0
```

**CDR rows for session:** **1** (only the inbound customer leg).

**Successful SIP-trunk call to same CLD (June 28, 2026 — for comparison):**

Session `9b901686-7317-11f1-9953-02420a0dda1f`:

```
call-session 9b901686-7317-11f1-9953-02420a0dda1f
├── sip-trunking 9b90219e-7317-11f1-bcc2-02420a0dda1f  flow_source=telnyx_connection  leg_direction=inbound   connected=1
└── sip-trunking 9c13d908-7317-11f1-9570-0aede8f65c3f  flow_source=telnyx_cc_app     leg_direction=outbound  connected=1
```

**CDR rows for that session:** **2**. Answer delay ~**26 seconds** after start.

**Cancelled call to same CLD (June 28 — still had both legs):**

Session `0a707bf2-7306-11f1-a242-02420a21041f`:

| Leg ID | flow_source | leg_direction | connected | hangup |
|--------|-------------|---------------|-----------|--------|
| `0a708b60-7306-11f1-aab1-02420a21041f` | telnyx_connection | inbound | 0 | ORIGINATOR_CANCEL |
| `0b0abfdc-7306-11f1-b279-02420a21041f` | telnyx_cc_app | **outbound** | 0 | MANAGER_REQUEST |

**Conclusion:** Missing outbound `telnyx_cc_app` B-leg is **not** normal user-cancel behaviour. Even cancelled historical calls to `+18648082167` had two legs.

---

## 6. Connection settings verified (rules out instant ringback)

Queried via `GET /v2/credential_connections/2982156817053779933`:

| Setting | Value |
|---------|-------|
| `connection_name` | VSP-SIP-Trunk |
| `active` | true |
| `outbound.instant_ringback_enabled` | **false** |
| `outbound.generate_ringback_tone` | **false** |
| `outbound.outbound_voice_profile_id` | `2982164000495633730` |
| `outbound.localization` | US |

Outbound Voice Profile `VSP-Outbound`: `whitelisted_destinations: ["US"]`, `enabled: true`.

---

## 7. RC1 test calls same day (same pattern)

All outbound RC1 test calls on 2026-07-25 show `connected=0`, single-leg or missing B-leg pattern, `ORIGINATOR_CANCEL`, `telnyx_error_code=D00`:

| UTC start | SIP Call-ID (prefix) | CLD | connected | hangup |
|-----------|----------------------|-----|-----------|--------|
| 19:04:03 | `TLYEOszuw35OP26ZLqtjCg..` | +18648082167 | 0 | ORIGINATOR_CANCEL |
| 18:57:31 | `7CcFblWwADbO_zzMBlSMnQ..` | +18648082167 | 0 | ORIGINATOR_CANCEL |
| 18:56:44 | `Qom1HxqXM6mFVNvLVN6Y-A..` | +13174492106 | 0 | ORIGINATOR_CANCEL |

---

## 8b. Root cause and fix

| Setting | Value before fix | Effect |
|---------|------------------|--------|
| `outbound.call_parking_enabled` | **`true`** | Telnyx **parks** outbound INVITEs instead of bridging to PSTN |
| `webhook_event_url` | `https://api.vspphone.com/webhook/voice` | Telnyx expects Voice API dial/bridge via webhook — **not implemented** for direct SIP trunk |

Per [Telnyx SIP Connection Settings](https://support.telnyx.com/en/articles/4351104-sip-connection-settings): *"Park Outbound Calls… Telnyx will have generated a SIP 180 Ringing message to instruct the client to generate local ringback"* while the call awaits Call Control commands. This matches our capture exactly (180 at +285 ms, no B-leg, no RTP).

**Fix:** Disable call parking on connection `2982156817053779933`:

```bash
bash rc1-evidence/fix-telnyx-call-parking.sh
```

No Kamailio, RoutingService, RTPengine, or authentication code changes required.

---

| Layer | Result |
|-------|--------|
| SIP REGISTER | Working |
| Desk SIP auth (Kamailio → API) | Working |
| Carrier SIP auth (407 → uac_auth retry) | Working |
| CLI rewrite (`+13136506292`) | Working — confirmed in authenticated INVITE and Telnyx CDR `cli` |
| Routing / BRIDGE_CARRIER | Working |
| Telnyx INVITE acceptance | Working |
| A-leg 180 relay | Working — Kamailio relays Telnyx 180 unchanged |
| Audible ringback | Zoiper local tone on signal-only 180 (no Telnyx early media) |
| RTPengine | No session established (no 200 OK) — expected for unanswered call |

**No further Kamailio, RoutingService, RTPengine, or authentication changes are planned.**

---

## 9. Questions for Telnyx

1. **Why was no outbound `telnyx_cc_app` B-leg instantiated** for session `9a673e20-885b-11f1-9f61-02420aef93a0` / Call-ID `TLYEOszuw35OP26ZLqtjCg..`?

2. **Why was `180 Ringing` generated on the A-leg at +285 ms** (signal-only, no SDP) **before** B-leg creation, with `instant_ringback_enabled=false` and `generate_ringback_tone=false`?

3. **What internal Telnyx event or decision prevented B-leg creation?** Please provide the internal reason code, log entry, or policy evaluation result.

4. **Is this related to** the SIP Connection (`2982156817053779933`), Outbound Voice Profile (`2982164000495633730`), routing policy, STIR/SHAKEN handling, fraud controls, channel limits, anchor site selection (`preferred_anchorsite: Latency`), or another internal platform decision?

5. **Please provide the internal SIP ladder for the B-leg** from Mission Control **SIP Call Flow Tool** for this session (or confirm B-leg signaling never occurred).

6. **Was the INVITE ever transmitted to the downstream carrier** (OCN `515J`, LRN `8646861999`)? If not, at what internal stage did propagation stop?

---

## 10. Requested deliverables from Telnyx

- [ ] Mission Control **SIP Call Flow Tool** export / screenshot for Call-ID `TLYEOszuw35OP26ZLqtjCg..` or session `9a673e20-885b-11f1-9f61-02420aef93a0`
- [ ] Internal explanation for missing `telnyx_cc_app` outbound leg
- [ ] Confirmation whether downstream carrier was attempted / alerted
- [ ] Root-cause classification (configuration, routing, fraud, platform bug, etc.)
- [ ] Remediation steps if account-side; bug reference if platform-side

---

## 11. Ready-to-send support ticket (copy/paste)

**Subject:** Missing outbound B-leg (`telnyx_cc_app`) — A-leg 180 without PSTN delivery — Call-ID `TLYEOszuw35OP26ZLqtjCg..`

**Body:**

Hello Telnyx Support,

We are investigating an outbound SIP Trunking call where our customer heard ringback but the PSTN destination never rang. Packet capture and Telnyx API correlation indicate our platform is functioning correctly. We need Telnyx to explain why the outbound PSTN B-leg was never created.

**Call identifiers:**
- SIP Call-ID: `TLYEOszuw35OP26ZLqtjCg..`
- Telnyx Session ID: `9a673e20-885b-11f1-9f61-02420aef93a0`
- SIP Trunking Leg ID: `9a674ce4-885b-11f1-8b7b-02420aef93a0`
- FS Channel ID: `885f1ddd-a1e8-4636-81de-f6f21a405ae7`
- Time (UTC): 2026-07-25 19:04:03 – 19:04:20
- CLI: +13136506292 → CLD: +18648082167
- Connection: VSP-SIP-Trunk (2982156817053779933)
- Outbound Voice Profile: VSP-Outbound (2982164000495633730)
- Auth username: userinfo26316

**Observed behaviour:**
- Authenticated INVITE accepted; LRN 8646861999; route Inter; STIR/SHAKEN A.
- Telnyx returned 180 Ringing on A-leg at +285 ms (no SDP). No 183, 200 OK, or RTP.
- Detail Record: attempted=1, connected=0, hangup=ORIGINATOR_CANCEL (recv_cancel), Q.850 cause 16, sip_invite_failure_status=487, telnyx_error_code=D00.
- Session Analysis shows **only one CDR leg** (flow_source=telnyx_connection, leg_direction=inbound). **No outbound telnyx_cc_app B-leg.**
- Historical calls to +18648082167 (including cancelled calls) consistently show **two legs** (inbound + outbound). This single-leg outcome is abnormal.
- Connection settings: instant_ringback_enabled=false, generate_ringback_tone=false.

**Questions:**
1. Why was no outbound telnyx_cc_app B-leg instantiated?
2. Why was 180 Ringing sent before B-leg creation?
3. What internal event prevented B-leg creation?
4. Is this related to our SIP Connection, Voice Profile, routing, fraud controls, or another internal decision?
5. Please provide the B-leg SIP ladder from Mission Control SIP Call Flow Tool.
6. Was the INVITE transmitted to the downstream carrier (OCN 515J)?

We will not modify our production platform further until Telnyx explains why the B-leg was never created. Full evidence package available on request.

Thank you.

---

## 12. Local evidence artifacts

| Artifact | Location |
|----------|----------|
| This support package | `rc1-evidence/RC1-telnyx-bleg-support-package.md` |
| Prior A-leg auth/482 investigation | `rc1-evidence/RC1-carrier-auth-482-investigation.md` |
| Packet capture (A-leg) | Production server `/tmp/telnyx-fix-validation.pcap` |
| Telnyx API investigation scripts | `rc1-evidence/telnyx-bleg-*.sh` |
| Server API report | Production server `/tmp/telnyx-bleg-report.txt`, `/tmp/telnyx-bleg-dump.out` |

**Mission Control lookup:** Debugging → SIP Call Flow Tool → filter CLI `+13136506292`, CLD `+18648082167`, UTC window 2026-07-25 19:04:00 – 19:05:00, direction outbound.

---

*Prepared: 2026-07-25. Platform: VSP Phone v4 RC1. No production code changes pending Telnyx response.*
