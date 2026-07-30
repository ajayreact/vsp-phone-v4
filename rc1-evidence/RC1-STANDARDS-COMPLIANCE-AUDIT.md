# RC1 Standards Compliance Audit — Grandstream → Kamailio → Telnyx → PSTN

**Date:** 2026-07-30  
**Branch:** `release/v4.0.0-rc1`  
**Scope:** Full protocol audit (RFC 3261, Kamailio TM/RR/dialog, Telnyx Record-Route / P01, Asterisk PJSIP reference)  
**Method:** Evidence-first (wire captures + config), not incremental hypotheses

---

## Executive verdict

| Item | Result |
|------|--------|
| **Exact root cause** | Carrier ACK was built with correct SIP **Route headers** but `$du` was set to `$null`, so `t_relay()` delivered the UDP packet to the **R-URI host** (`…@telnyx.com`) instead of the **first Route hop** (`192.76.120.10:5060`). |
| **Standards violated** | RFC 3261 §12.2.1.1 / §16.12 (loose routing); Telnyx Record-Route + P01 docs; Asterisk reference wire path |
| **Why ~32s BYE** | Telnyx Timer H / ack_timeout — ACK never accepted on the proxy path that owns the dialog |
| **Why ~10s audio delay** | Hybrid waits for Grandstream desk ACK before carrier ACK relay; Grandstream is slow/fragile vs Asterisk UAC (~1 ms) |
| **Architecture** | Hybrid stateful proxy + B2BUA header rewrites — dialog ownership inconsistent |
| **Fix** | Always set `$du=sip:192.76.120.10:5060` for carrier ACK; PBX Contact on carrier INVITE; stop `record_route()` on carrier INVITE |

---

## 1. Architecture classification

| Layer | Intended | Actual (pre-fix) | Asterisk FreePBX |
|-------|----------|-------------------|------------------|
| Desk leg | UAS / registrar | Stateful proxy + `dlg_manage` | B2BUA desk leg |
| Carrier leg | Trunk UAC | **Rewritten desk INVITE + `t_relay()`** | True UAC (own Contact, own ACK) |
| Call-ID | Shared | Same Call-ID both legs | Separate Call-IDs |
| ACK to Telnyx | End-to-end proxy ACK | Relayed desk ACK + surgery | Local UAC ACK (~1 ms) |
| Contact to Telnyx | PBX | **Desk phone Contact** | Asterisk Contact |
| Record-Route | Desk only | **`record_route()` on carrier INVITE** | Not inserted by Asterisk UAC |

**Verdict:** Hybrid. Header/auth/media rewrite like a B2BUA; INVITE/ACK forwarding like a proxy. Ownership of the Telnyx dialog is split between Kamailio (From/auth/CSeq) and the phone (Contact/ACK timing).

---

## 2. Dialog creation audit (RFC 3261 §12)

| Element | Requirement | Pre-fix wire | Compliant? |
|---------|-------------|---------------|------------|
| Call-ID | Stable for dialog | Same desk→carrier | Yes (hybrid choice) |
| From-tag | Stable UAC local tag | Preserved across 407→auth INVITE | Yes |
| To-tag | From 200 OK | Present on 183/200 | Yes |
| Contact (INVITE→Telnyx) | Remote target = signaling owner | Phone NAT Contact | **NO** |
| Route set | From 200 OK Record-Route (reversed) | Stored + applied on ACK | Partial (headers yes, next-hop no) |
| CSeq auth | +1 after 407 | 10→11 | Yes |
| Via | Proxy adds own Via | Kamailio + phone Via retained | Proxy-like |

---

## 3. Record-Route / Route (Telnyx docs + RFC 3261)

Telnyx ([Record-Route headers](https://support.telnyx.com/en/articles/9133298-sip-record-route-headers)):

> ACK Route headers must be the **reverse** of 200 OK Record-Route. Wrong/missing order → **ack_timeout**.

Telnyx ([P01 / 32s](https://support.telnyx.com/en/articles/4409457-telnyx-sip-response-codes)):

> Even with a correct R-URI, missing/wrong **Route** → transaction broken → drop after **32 seconds**. Same class of failure applies to ACK.

### Carrier 200 OK RR (evidence `1938501546`)

```
Record-Route: <sip:10.255.0.1;r2=on;lr;ftag=…>
Record-Route: <sip:192.76.120.10;r2=on;lr;ftag=…>
Record-Route: <sip:32.196.41.160;…>    ← Kamailio self (from record_route on carrier INVITE)
```

### Required ACK Route (after skipping self)

```
Route: <sip:192.76.120.10;r2=on;lr;…>   ← first hop = UDP destination
Route: <sip:10.255.0.1;r2=on;lr;…>
ACK r-uri = Contact (encoded telnyx*…@telnyx.com)
```

### Asterisk reference ACK (`b6e25f34`)

- UDP dst: **192.76.120.10:5060**
- Route: both Telnyx hops
- R-URI: encoded Contact
- No Asterisk Record-Route hop

### Kamailio bug (exact)

```kamailio
# PRE-FIX (violation)
if (routes present) { $du = $null; }  # t_relay → R-URI host (telnyx.com)
else { $du = TELNYX_SBC_DU; }
```

`CARRIER_SANITIZE_ACK_DU` returns immediately when `$du` is null — so it could not correct this.

---

## 4. Packet comparison — Asterisk vs Kamailio ACK

| Field | Asterisk (accepted) | Kamailio relay (recent) | Match |
|-------|---------------------|-------------------------|-------|
| Request-URI | Encoded Contact | Encoded Contact | YES |
| From-tag | Carrier INVITE tag | Restored from carrier 200 | YES (after rewrite) |
| To-tag | 200 OK tag | Restored | YES |
| Call-ID | INVITE Call-ID | Same | YES |
| CSeq | Auth INVITE N ACK | Auth N ACK | YES (after bump) |
| Route hops | 192.76.120.10, 10.255.0.1 | Stored/applied | YES (headers) |
| **UDP next hop** | **192.76.120.10** | **R-URI host when `$du=null`** | **NO** |
| Timing | ~1 ms after 200 | Waits for Grandstream (~7–10s) | NO |

---

## 5. Authentication (RFC 3261 digest)

| Step | Expected | Observed | OK? |
|------|----------|----------|-----|
| 407 challenge | Proxy-Authenticate | Present | YES |
| ACK for 407 | Same CSeq as challenged INVITE | CSeq 10 ACK | YES |
| Auth INVITE | CSeq+1 + Proxy-Authorization | CSeq 11 | YES |
| ACK for 200 | CSeq = auth INVITE | Bumped in relay | YES (logic) |

Auth itself is not the teardown cause once CSeq bump is applied.

---

## 6. Grandstream interoperability

| Issue | Evidence | Status |
|-------|----------|--------|
| Zero ACK when desk Contact = Telnyx encoded / `sip:0@0` | `RC1-grandstream-zero-ack-endpoint-proof.md` | Fixed (PBX Contact on desk 200) |
| Slow ACK (~7–10s) after answer | Interop docs; user report | Explains media/timer delay |
| Relayed ACK still not accepted | 32s BYE with ACK Timeout | **`$du` next-hop bug** |

---

## 7. RTP

| Observation | Interpretation |
|-------------|----------------|
| Carrier RTP flowing, desk RTP 0 (earlier) | Separate media/NAT issue (`d6d2b2f` flags) |
| Audio starts ~10s after answer | Correlates with late desk ACK / dialog confirm on phone |
| RTP delete after BYE | Not the teardown initiator |

RTP is **secondary** to SIP dialog acceptance. Fix ACK path first; re-verify bidirectional RTP on ≥10 min hold.

---

## 8. Kamailio module deviations

| Module | Setting / use | Deviation |
|--------|---------------|-----------|
| `tm` | `local_ack_mode=0` | Correct for `t_uac*`; **does not** auto-ACK `t_relay()` carrier INVITEs |
| `tm` | Carrier via `t_relay` | Unlike Asterisk UAC — depends on desk ACK |
| `rr` | `record_route()` on BRIDGE_CARRIER | Inserted Kamailio into Telnyx RR (Asterisk does not) |
| `uac` | `uac_auth` + `uac_replace_from` | Correct for CLI/auth; prior `uac_req_send` ACK created orphan dialogs |
| `dialog` | `track_cseq_updates=1` | Appropriate for auth CSeq bump |
| `nathelper` | `fix_nated_contact` on replies | Can interact with Contact; desk normalize overrides |

---

## 9. Exact fix (implemented)

1. **`CARRIER_RELAY_ACK`:** Always `$du = TELNYX_SBC_DU` (`sip:192.76.120.10:5060`) + `$fs` bind — Route headers remain in the SIP message; UDP goes to first Route hop (Asterisk-identical).
2. **BRIDGE_CARRIER Contact:** Replace phone Contact with `sip:<cli>@<public-ip>:5060`.
3. **Remove `record_route()`** from BRIDGE_CARRIER (match Asterisk UAC; ACK Route = Telnyx hops only).
4. **In-dialog without Route:** Desk BYE/ACK after RR-stripped 200 OK routed via stored carrier dialog (avoid 404).

---

## 10. Validation (must run on EC2 — proves fix)

```bash
cd /opt/vsp-phone-v4
git pull origin release/v4.0.0-rc1
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
$COMPOSE up -d --build kamailio
$COMPOSE exec kamailio kamailio -c -f /tmp/kamailio.runtime.cfg

# Capture full call (do not Ctrl+C early)
SEC=900 bash rc1-evidence/capture-teardown.sh
# Place Grandstream → PSTN; hold ≥ 10 minutes; hang up manually

PCAP=$(ls -t /tmp/teardown-capture-*/docker.pcap | head -1)
bash rc1-evidence/compare-ack-wire.sh "$PCAP"
bash rc1-evidence/investigate-32s-call.sh   # if Call-ID known
```

### PASS criteria

| Check | Required |
|-------|----------|
| Post-200 ACK UDP dst | `192.76.120.10:5060` (not telnyx.com-only resolution / not 10.239.x.x) |
| ACK Route count | 2 (192.76.120.10, 10.255.0.1) |
| ACK From/To/CSeq | Match auth INVITE dialog |
| Carrier INVITE Contact | `…@32.196.41.160:5060` (PBX), not phone IP |
| No BYE at T+32s | No `Reason: …ACK Timeout` |
| Telnyx CDR | `call_sec >= 600` |
| Teardown | Normal BYE after manual hang-up |

---

## References

- RFC 3261 §12.1.1, §12.2.1.1, §13.2.2.4, §16.12  
- [Telnyx SIP Record-Route](https://support.telnyx.com/en/articles/9133298-sip-record-route-headers)  
- [Telnyx SIP Response Codes (P01 / 32s)](https://support.telnyx.com/en/articles/4409457-telnyx-sip-response-codes)  
- Kamailio TM `local_ack_mode` — applies to local UAC transactions only  
- Repo evidence: `RC1-protocol-investigation.md`, `RC1-ack-rejected-investigation.md`, `RC1-freepbx-reference-comparison.md`, `sip-trace-1938501546.txt`
