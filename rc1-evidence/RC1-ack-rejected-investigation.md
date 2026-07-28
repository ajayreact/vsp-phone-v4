# RC1 Final Investigation — Telnyx ACK Rejected (Not ACK Generation)

**Status:** Protocol corrections deployed — wire validation required  
**Reference call:** `1712229967-18568-5@BCC.BHH.CEG.JC`  
**Date:** 2026-07-28 UTC

---

## Executive verdict

ACK **generation and relay are working**. Telnyx still tears down at **T+32.000s** from first 200 OK because the relayed ACK is **not associated with the authenticated INVITE dialog** on the wire.

| Phase | Evidence | Status |
|-------|----------|--------|
| Grandstream ACK | +7.76s after first 200 OK | ✅ |
| Kamailio relay | CSeq 41, carrier From/To, encoded R-URI | ✅ (logs) |
| Telnyx accept | BYE at T+32s from 200 OK | ❌ |
| Session timers / UPDATE / re-INVITE | Absent | Ruled out |
| RTPengine BYE origin | delete after SIP BYE | Ruled out |

---

## Side-by-side: Asterisk (accepted) vs Kamailio (rejected)

### Asterisk PJSIP ACK (reference — `b6e25f34`, `/tmp/asterisk-ref-20260728T072455Z/all.pcap`)

```
ACK sip:telnyx*17045502033**10.239.45.224*5070*udp@telnyx.com SIP/2.0
Via: SIP/2.0/UDP 172.31.39.116:5160;rport;branch=z9hG4bKPj...
From: "Anonymous" <sip:+13136506292@sip.vspphone.com>;tag=0b184e37-75bb-47a0-b5c1-e3d30c2b1426
To: <sip:17045502033@sip.telnyx.com>;tag=8UKaNUXv5g5vF
Call-ID: b6e25f34-e3e8-4588-98e2-7fa8d3043d7a
CSeq: 24279 ACK
Route: <sip:192.76.120.10:5060;lr;r2=on;ftag=0b184e37-...>
Route: <sip:10.255.0.1;lr;r2=on;ftag=0b184e37-...>
Max-Forwards: 70
Content-Length: 0
```

### Kamailio relay ACK (call `1712229967` — log-reconstructed)

```
ACK sip:telnyx*19724301252**10.239.101.132*5070*udp@telnyx.com SIP/2.0
Via: (new branch from Kamailio)
From: <sip:+13136506292@sip.vspphone.com>;tag=1472815996
To: <sip:19724301252@sip.vspphone.com>;tag=mgF93BtDKFmja
Call-ID: 1712229967-18568-5@BCC.BHH.CEG.JC
CSeq: 41 ACK
Route: <sip:192.76.120.10;r2=on;lr;ftag=1472815996>   ← wire verify hop 1
Route: <sip:10.255.0.1;r2=on;lr;ftag=1472815996>       ← wire verify hop 2
Max-Forwards: 70
Content-Length: 0
```

### Field comparison

| Field | Asterisk | Kamailio (1712229967) | Match |
|-------|----------|----------------------|-------|
| Request-URI | Encoded Telnyx Contact | Encoded Telnyx Contact | ✅ |
| CSeq | Auth INVITE number ACK | 41 (desk 40 + auth bump) | ✅ |
| From tag | Carrier INVITE tag | 1472815996 | ✅ |
| To tag | 200 OK To tag | mgF93BtDKFmja | ✅ |
| Call-ID | Same as INVITE | Same | ✅ |
| Route hop 1 | 192.76.120.10 | 192.76.120.10 (stored) | ⚠️ verify wire |
| Route hop 2 | 10.255.0.1 | 10.255.0.1 (stored) | ⚠️ **log showed only hop 1** — `$hdr(Route)` prints first header only |
| Desk 200 From | Single valid From | **Malformed duplicate** | ❌ **fixed: remove_hf+append_hf** |

---

## Priority 1 — Route set

### Storage (call 1712229967)

Kamailio log confirmed **both hops stored**:

```
carrier Record-Route stored ... ack_route=
  <sip:192.76.120.10;r2=on;lr;ftag=1472815996>|<sip:10.255.0.1;r2=on;lr;ftag=1472815996>
```

Record-Route on carrier 200 OK (Telnyx order):

1. `10.255.0.1` (index [0])
2. `192.76.120.10` (index [1])

Reversed for ACK Route (RFC 3261):

1. `192.76.120.10` — first hop
2. `10.255.0.1` — second hop

### Why relay log showed one Route

Kamailio `$hdr(Route)` returns **only the first** Route header. This misled prior analysis.

### Fix applied

- Rewrite `CARRIER_STORE_RECORD_ROUTE` — forward collect [0..n], reverse into htable
- Rewrite `CARRIER_APPLY_ACK_ROUTE` — append each hop, log `wire0` / `wire1` via `$(hdr(Route)[0])` and `$(hdr(Route)[1])`
- ACK relay log now prints `route0=` and `route1=` explicitly

---

## Priority 2 — Desk 200 OK malformed From

### Observed on wire (log)

```
from="Ajay 100" <sip:100@sip.vspphone.com>"Ajay 100" <sip:100@sip.vspphone.com>;tag=1472815996
```

### Root cause

`subst_hf("From", "/.*/$var(df)/", "a")` with quoted display names in `$var(df)` produced **partial replacement / duplication** on desk-facing 183/200 (especially across 200 OK retransmits).

### Fix applied

Replace `subst_hf` with atomic **`remove_hf("From")` + `append_hf("From: $var(df)\r\n")`** (same for desk CSeq). Carrier ACK From/To use the same pattern.

---

## Priority 3 — Wire capture procedure

**Do not Ctrl+C.** Run:

```bash
cd /opt/vsp-phone-v4
SEC=900 bash rc1-evidence/capture-teardown.sh
# Grandstream → PSTN, hold >= 10 minutes through disconnect

PCAP=$(ls -t /tmp/teardown-capture-*/docker.pcap | head -1)
CALL=1712229967   # or current Call-ID prefix

python3 rc1-evidence/extract-sip-ladder.py "$PCAP" "$CALL"
bash rc1-evidence/compare-ack-wire.sh "$PCAP" "$CALL"
```

### PASS criteria (wire)

| Check | Expected |
|-------|----------|
| Post-200 ACK Route count | **2** hops (192.76.120.10, 10.255.0.1) |
| ACK CSeq | desk_N + 1 |
| Desk 200 From | Single `"Ajay 100" <sip:100@...>;tag=...` |
| Telnyx BYE | After **>600s**, or no BYE at T+32s |
| BYE Reason | No `408 ACK Timeout` |

### Kamailio log PASS (post-deploy)

```
carrier ACK route append idx=0 hop=<192.76.120.10...>
carrier ACK route append idx=1 hop=<10.255.0.1...>
carrier ACK route applied count=2 wire0=... wire1=...
carrier phone ACK relay ... route0=... route1=... cseq=41 ACK
desk carrier reply normalized ... from="Ajay 100" <sip:100@...>;tag=...  (no duplicate)
```

---

## Why Telnyx rejects Kamailio but accepts Asterisk

| Reason | Asterisk | Kamailio (pre-fix) |
|--------|----------|-------------------|
| Complete Route set on ACK | Both hops on wire | Possibly hop 2 missing on wire; log showed 1 due to `$hdr(Route)` |
| Desk 200 OK validity | Clean From, valid Contact | Malformed duplicated From → delayed/confused Grandstream ACK (+7.76s) |
| ACK timing | ~1 ms after 200 OK | +7.76s (Grandstream); Telnyx waits up to 32s if ACK invalid |
| Dialog association | Full RFC 3261 match | CSeq/From/To fixed; Route + desk 200 were remaining gaps |

Telnyx does not send `Reason: 408` in CDR summary for all ACK failures — **`call_sec=32` + `send_bye` + T+32.000s from 200 OK** is the discriminator.

---

## Artifacts

| File | Purpose |
|------|---------|
| `RC1-ack-rejected-investigation.md` | This report |
| `compare-ack-wire.sh` | Post-capture ACK vs 200 OK field diff (all Route hops) |
| `extract-sip-ladder.py` | Full ladder including BYE Reason |
| `capture-teardown.sh` | Complete wire capture |
