# RC1 FreePBX (Asterisk PJSIP) Reference Comparison

**Status:** Active — carrier ACK dialog rewrite deployed @ `4a72a1c+`  
**Reference:** Asterisk 18 PJSIP (`andrius/asterisk:18-current`) — Telnyx-supported FreePBX stack  
**Production:** Kamailio 5.8.7 hybrid B2BUA → Telnyx → PSTN  
**Endpoint:** Grandstream GRP2601 (extension 100)

---

## Methodology

Telnyx documents FreePBX (Asterisk) and FusionPBX (FreeSWITCH) as supported reference PBXs. We use **Asterisk 18 PJSIP** on the same EC2 host with the **same Telnyx credential connection** as Kamailio.

| Phase | Script | Purpose |
|-------|--------|---------|
| A — Reference | `rc1-evidence/pbx-interop-test.sh` Phase A | Asterisk originate → PSTN, full carrier ladder |
| B — Production | `rc1-evidence/pbx-interop-test.sh` Phase B | Grandstream → Kamailio → PSTN capture |
| C — Compare | `rc1-evidence/compare-pbx-ladders.py` | Milestone-aligned header diff + summary table |
| Optional desk ref | `GS_ASTERISK_DESK=1` | Grandstream registered to Asterisk :5160 (full desk+carrier on reference) |

**Do not copy Asterisk config into Kamailio.** Compare behavior; implement equivalent semantics in Kamailio routes.

---

## Architecture differences (expected, not defects)

| SIP Element | FreePBX / Asterisk | Kamailio | Match | Notes |
|-------------|-------------------|----------|-------|-------|
| Telnyx registration | Optional PJSIP registration to `sip.telnyx.com` | Credentials on outbound INVITE (407 digest) | N/A | Both supported by Telnyx |
| Call-ID per leg | Separate Call-IDs (true B2BUA) | Same Call-ID (hybrid proxy/B2BUA) | N/A | By design; ACK must preserve **carrier UAC dialog** |
| Desk Record-Route | Often absent on phone leg | Kamailio `record_route()` on desk INVITE | N/A | Grandstream uses Contact for ACK target |
| User-Agent | `Asterisk PBX` | `VSP-Phone-v4-Kamailio` | N/A | Cosmetic |

---

## Outbound call flow — milestone comparison

### Registration (desk phone → PBX)

| SIP Element | FreePBX | Kamailio | Match | Difference |
|-------------|---------|----------|-------|------------|
| Method | REGISTER | REGISTER | YES | |
| Contact | `sip:100@phone-ip:port` | `sip:100@phone-ip:port` | YES | |
| Expires | 60–3600 (provisioned) | 600 default | YES | |
| Auth | Digest (FreePBX) | NestJS-backed digest | YES | Different auth backend, same SIP shape |
| Path / Via | `force_rport`, Path supported | `force_rport`, Path supported | YES | |

### Carrier leg — INVITE through 200 OK

| SIP Element | FreePBX (Asterisk ref) | Kamailio | Match | Difference |
|-------------|------------------------|----------|-------|------------|
| carrier_invite R-URI | `sip:17045502033@sip.telnyx.com` | `sip:+17045502033@sip.telnyx.com` | Partial | E.164 `+` prefix |
| carrier_407 | YES | YES | YES | |
| carrier_invite_auth CSeq | N+1 after 407 | N+1 after 407 | YES | |
| carrier_183 Contact | Telnyx encoded `telnyx*…*@telnyx.com` | Same shape | YES | B2BUA IP differs per call |
| carrier_200 Contact | Telnyx encoded | Telnyx encoded | YES | |
| carrier_200 Record-Route | Telnyx hops (2) | Telnyx hops + Kamailio RR | Partial | Extra Kamailio hop on desk leg only |
| carrier_200 Session-Expires | Absent (observed) | Absent (observed) | YES | Not the 32s timer |

### Desk leg — 200 OK to Grandstream (FreePBX B2BUA equivalent)

FreePBX does **not** forward Telnyx encoded Contact to the phone. It presents a **PBX-reachable Contact**.

| SIP Element | FreePBX (expected) | Kamailio (post-fix) | Match | Difference |
|-------------|-------------------|---------------------|-------|------------|
| desk_200 Contact | `sip:<ext>@<pbx-public-ip>:5060` | `sip:100@32.196.41.160:5060` | YES | Fixed @ 08799d0 |
| desk_200 From | Preserved desk INVITE From | `subst_hf` restored desk From | YES | Fixed @ ae9c73b/4a72a1c |
| desk_200 CSeq | Desk INVITE CSeq | Desk INVITE CSeq restored | YES | Fixed @ ae9c73b |
| desk_200 Record-Route | Stripped or PBX-only | Stripped (`remove_hf`) | YES | |
| desk_ack present | YES (ms after 200) | YES (Grandstream ~7–10s delay) | Partial | Slow ACK, not zero |

**First historical divergence (resolved):** desk_200 **Contact** = `sip:0@0` or Telnyx URI → Grandstream sent **zero ACK**.  
Evidence: `RC1-grandstream-zero-ack-endpoint-proof.md`, `RC1-pbx-interop-comparison.md`.

### Carrier ACK — critical path (FreePBX vs Kamailio)

Asterisk reference (`b6e25f34`, `/tmp/asterisk-ref-20260728T072455Z/all.pcap`):

```
ACK sip:telnyx*17045502033**10.239.45.224*5070*udp@telnyx.com SIP/2.0
Route: <sip:192.76.120.10:5060;lr;…>
Route: <sip:10.255.0.1;lr;…>
From: <sip:+13136506292@sip.vspphone.com>;tag=<carrier-invite-tag>
To: <sip:17045502033@sip.vspphone.com>;tag=<200-ok-tag>
CSeq: 24279 ACK
Call-ID: b6e25f34-e3e8-4588-98e2-7fa8d3043d7a
```

| SIP Element | FreePBX (Asterisk) | Kamailio pre-fix | Kamailio post-fix | Match |
|-------------|-------------------|------------------|-------------------|-------|
| carrier_ack present | YES (~1 ms after 200) | Orphan/wrong or relayed desk ACK | Relay desk ACK + rewrite | PENDING |
| Request-URI | Encoded Telnyx Contact | Encoded Contact | Encoded Contact | YES |
| Route | Reversed Record-Route | Absent / bypass | Reversed RR when stored | FIXED |
| From | Carrier INVITE From + tag | Desk `sip:100@…` tag | **carrier 200 From restored** | FIXED |
| To | 200 OK To + tag | Desk To (may match) | **carrier 200 To restored** | FIXED |
| CSeq | Auth INVITE number ACK | Desk CSeq (wrong) | **carrier 200 CSeq** | FIXED |
| $du routing | Via Route (Telnyx edge) | Direct B2BUA socket | **Route-first; $du cleared** | FIXED |

**Second divergence (fix in progress):** relayed desk ACK retained **desk From URI** and **wrong CSeq** → Telnyx ignored ACK → BYE @ 32s `408 ACK Timeout`.  
Evidence: `RC1-protocol-investigation.md` §2.

---

## Symptom timeline explained

| User observation | SIP explanation |
|------------------|-----------------|
| Mobile rings | Carrier 183/180 reaches desk; ringback OK |
| ~10s after answer, no desk timer/audio | Grandstream slow post-200 ACK; RTP anchored at answer |
| Two-way audio starts | Desk ACK eventually sent; RTPengine bridged |
| Disconnect ~32s after answer (or ~32s after audio) | Telnyx ACK watchdog from **200 OK** (~32s); invalid carrier ACK ignored |

---

## Fixes applied (chronological)

| Commit | Fix | FreePBX equivalent |
|--------|-----|-------------------|
| `08799d0` | Desk Contact `sip:ext@public-ip:5060` | Asterisk `rewrite_contact` / PBX Contact |
| `ae9c73b` | Desk From/CSeq restore on 18x/200 | B2BUA preserves phone dialog on desk leg |
| `8aa18a1` | `$var` staging for `subst_hf` htable reads | Config parse fix |
| `4a72a1c` | Sed-style `subst_hf` `/match/replace/` | Config parse fix |
| **current** | Carrier From/To + Route-first ACK relay | Asterisk PJSIP ACK dialog + Route set |

---

## Validation (PASS criteria)

Run on EC2 after deploy:

```bash
cd /opt/vsp-phone-v4
git pull origin release/v4.0.0-rc1
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
$COMPOSE build kamailio && $COMPOSE up -d --no-deps --force-recreate kamailio

# Full interop test (Asterisk ref + Grandstream capture + compare)
export DEST=+17045502033 PHONE_IP=122.177.246.92 KAM_SEC=900
bash rc1-evidence/pbx-interop-test.sh

# Or validation-only
SEC=900 bash rc1-evidence/validate-32s-fix.sh
```

**PASS when all true:**

1. `carrier dialog stored from=… to=…` in Kamailio logs  
2. `carrier phone ACK relay … cseq=61 ACK` (not desk 60)  
3. `carrier phone ACK relay … route=<non-empty>`  
4. Wire: carrier ACK From = `+13136506292@…` with carrier tag  
5. No BYE `408 ACK Timeout`  
6. Telnyx CDR `call_sec >= 600`  
7. `compare-pbx-ladders.py` reports no diff on `carrier_ack/From`, `carrier_ack/CSeq`, `carrier_ack/Route`

---

## Artifacts

| File | Description |
|------|-------------|
| `rc1-evidence/pbx-interop-test.sh` | Automated Asterisk + Kamailio capture + compare |
| `rc1-evidence/compare-pbx-ladders.py` | Milestone ladder diff + summary table |
| `rc1-evidence/run-asterisk-originate.sh` | Asterisk-only quick baseline |
| `rc1-evidence/RC1-pbx-interop-comparison.md` | First divergence analysis (Contact) |
| `rc1-evidence/RC1-protocol-investigation.md` | Carrier ACK field-by-field verdict |
| `rc1-evidence/RC1-grandstream-zero-ack-endpoint-proof.md` | Zero-ACK wire proof |

---

## Next comparison if still failing

1. Capture wire ACK with `investigate-32s-call.sh <Call-ID>`  
2. Diff `carrier_ack` against Asterisk ref in same report  
3. Check Grandstream desk ACK delay (provisioned Contact / DNS / firewall)  
4. Optional: `GS_ASTERISK_DESK=1` — same phone through Asterisk for full desk+carrier reference
