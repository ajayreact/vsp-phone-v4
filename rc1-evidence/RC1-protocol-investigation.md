# RC1 Root Cause: Telnyx 408 ACK Timeout (Protocol Investigation)

**Status:** FIX IMPLEMENTED (desk-facing 200 OK normalization) — validation pending (Grandstream + Zoiper ≥5 min)  
**Evidence call (pre-fix):** `50741629-44403-2@BCC.BHH.CEG.JC`  
**Capture:** `/tmp/teardown-capture-20260728T051730Z/docker.pcap`  
**CDR:** `call_sec=32`, hangup NORMAL_UNSPECIFIED, Telnyx BYE `Reason: SIP;cause=408;text="ACK Timeout"`  
**Date:** 2026-07-28 05:20:17–05:20:53 UTC

---

## Architecture analysis (Proxy vs B2BUA vs Hybrid)

| Layer | Role | Module ownership |
|-------|------|------------------|
| **Desk leg (UAS)** | Stateful proxy toward Grandstream/Zoiper | **RR** (`record_route()`), **TM** (UAS transaction), **Dialog** (`dlg_manage`, `track_cseq_updates`) |
| **Carrier leg (downstream UAC)** | Kamailio originates authenticated INVITE via `t_relay()` + `uac_auth()` on 407 | **TM** (client transaction), **UAC** (auth headers only — not ACK), **Dialog** (CSeq bump after auth) |
| **ACK to Telnyx 200 OK** | End-to-end on the authenticated INVITE transaction (RFC 3261 §13.2.2.4) | **TM** relays desk ACK; **RR** route set from 200 OK Record-Route; **not UAC** `uac_req_send()` |

**Verdict: Hybrid stateful B2BUA.** Same Call-ID on both legs, but Kamailio rewrites identity headers, performs trunk auth, and anchors media. It is not a transparent proxy (header/auth/media changes) and not a full dialog-generating B2BUA (no separate Call-ID per leg). ACK must preserve the **carrier UAC dialog** (From-tag, To-tag, auth CSeq, Route set).

### Documentation references

| Source | Relevance |
|--------|-----------|
| [RFC 3261 §12.2.1.1](https://www.rfc-editor.org/rfc/rfc3261#section-12.2.1.1) | ACK R-URI = Contact; dialog tags required |
| [RFC 3261 §12.2](https://www.rfc-editor.org/rfc/rfc3261#section-12.2) | Dialog = Call-ID + local-tag + remote-tag |
| [RFC 3261 §16.7 / §13.2.2.4](https://www.rfc-editor.org/rfc/rfc3261#section-13.2.2.4) | 2xx ACK is end-to-end; proxy relays upstream ACK downstream |
| [Kamailio TM — `local_ack_mode`](https://www.kamailio.org/docs/modules/stable/modules/tm.html) | Local ACK only for `t_uac*()` transactions; default mode 0 = RFC (Contact + route set) |
| [Kamailio TM — `event_route[tm:local-request]`](https://www.kamailio.org/docs/modules/stable/modules/tm.html) | May adjust `$ru`/`$du` on TM-generated requests — not for orphan UAC ACK |
| [Kamailio UAC — `uac_req_send()`](https://www.kamailio.org/docs/modules/stable/modules/uac.html) | Builds **new** local requests; not dialog-bound ACK for existing INVITE |
| [Kamailio Dialog — `track_cseq_updates`](https://www.kamailio.org/docs/modules/stable/modules/dialog.html) | CSeq bump after `uac_auth()`; subsequent in-dialog requests adjusted |
| [Telnyx Record-Route / ACK Timeout](https://support.telnyx.com/en/articles/9133298-sip-record-route-headers) | ACK must carry reversed Record-Route as Route |
| [Telnyx P01 / 32s ACK timeout](https://support.telnyx.com/en/articles/4409457-telnyx-sip-response-codes) | Missing/malformed ACK → BYE @ ~32s |
| [GitHub kamailio#1359](https://github.com/kamailio/kamailio/issues/1359) | ACK CSeq must match post-auth INVITE |
| [SR-Users: ACK for 200 is separate transaction](https://lists.kamailio.org/hyperkitty/list/sr-users@lists.kamailio.org/thread/RZWF2FH4337I7AKVQT5LPNORLNFBBW2H/) | ACK-to-2xx not part of INVITE transaction state machine |

---

## Root cause (packet-proven)

`uac_req_send()` in `route[CARRIER_SEND_ACK]` synthesized an **orphan ACK** — new From-tag, missing To-tag, wrong CSeq (10 vs auth 11), duplicate CSeq/Max-Forwards, no Route. Telnyx correctly ignored it and tore down @32s with ACK Timeout.

---

## Fix implemented

1. **Removed** `route[CARRIER_SEND_ACK]` and all `uac_req_send()` carrier ACK paths  
2. **Single ACK path:** relay desk ACK via `route[CARRIER_RELAY_ACK]` on open INVITE transaction (`t_check_trans` / `loose_route`)  
3. **Preserved dialog fields** from desk ACK (From-tag, To-tag); only adjust R-URI (`Contact`), `$du`, Route (from stored Record-Route), and CSeq (auth INVITE number from 200 OK)  
4. **Store** Telnyx Record-Route before stripping from desk-facing 200 OK  
5. **`local_ack_mode=0`** (RFC default); removed `tm:local-request` carrier CSeq surgery  

**File modified:** `infrastructure/kamailio/kamailio.cfg`

---

## Executive verdict

Telnyx does **not** “miss” the ACK because it was never sent.  
Kamailio **does send** an ACK to the B2BUA (`10.239.45.24:5070`) with the encoded Contact R-URI.

Telnyx classifies the ACK as missing because that ACK **does not belong to the INVITE dialog**.

The wire ACK fails RFC 3261 dialog matching on **From-tag**, **To-tag**, and **CSeq**, and is further malformed (**duplicate CSeq**). Telnyx therefore continues 200 OK retransmissions for ~32s and tears down with ACK Timeout.

---

## 1. SIP ladder (carrier leg)

| Time (UTC) | Message | Key fields |
|------------|---------|------------|
| 05:20:17.387 | INVITE → Telnyx | CSeq **10**, From-tag=`865222299` |
| 05:20:17.576 | 407 | |
| 05:20:17.576 | ACK (407) | CSeq **10 ACK** |
| 05:20:17.580 | **Auth INVITE** | CSeq **11**, From-tag=`865222299`, Proxy-Authorization present |
| 05:20:18.581 | 183 | Contact encoded; Record-Route present; To-tag=`XaH8D0p24vKUg` |
| 05:20:21.198 | **200 OK** | CSeq **11 INVITE**; Contact=`sip:telnyx*17045502033**10.239.45.24*5070*udp@telnyx.com`; From-tag=`865222299`; To-tag=`XaH8D0p24vKUg`; Record-Route: `10.255.0.1`, `192.76.120.10`, `32.196.41.160` |
| 05:20:21.202 | **ACK** → `10.239.45.24:5070` | See section 2 — **dialog mismatch** |
| 05:20:21–05:20:53 | 200 OK retransmits | Telnyx still waiting for valid ACK |
| 05:20:53.201 | **BYE** from Telnyx | `Reason: SIP;cause=408;text="ACK Timeout"` |

---

## 2. Packet-level comparison (authoritative)

### Authenticated INVITE (what established the dialog UAC side)

```
INVITE sip:+17045502033@sip.telnyx.com SIP/2.0
From: <sip:+13136506292@sip.vspphone.com>;tag=865222299
To: <sip:17045502033@sip.vspphone.com>
Call-ID: 50741629-44403-2@BCC.BHH.CEG.JC
CSeq: 11 INVITE
```

### Telnyx 200 OK (dialog confirmation + route set + Contact)

```
SIP/2.0 200 OK
Record-Route: <sip:10.255.0.1;r2=on;lr;ftag=865222299>
Record-Route: <sip:192.76.120.10;r2=on;lr;ftag=865222299>
Record-Route: <sip:32.196.41.160;lr=on;ftag=865222299;vsf=...;did=6d6.c721>
From: <sip:+13136506292@sip.vspphone.com>;tag=865222299
To: <sip:17045502033@sip.vspphone.com>;tag=XaH8D0p24vKUg
Call-ID: 50741629-44403-2@BCC.BHH.CEG.JC
CSeq: 11 INVITE
Contact: <sip:telnyx*17045502033**10.239.45.24*5070*udp@telnyx.com>
```

### Kamailio ACK actually transmitted (pcap, ens5 → 10.239.45.24:5070)

```
ACK sip:telnyx*17045502033**10.239.45.24*5070*udp@telnyx.com SIP/2.0
Via: SIP/2.0/UDP 32.196.41.160:5060;branch=z9hG4bK0.91b79345000000000000000000000000.0
To: <sip:17045502033@sip.vspphone.com>                    ← NO To-tag
From: <sip:+13136506292@sip.vspphone.com>;tag=64ff6b492a7d9ab14de1f0b7c15c9c17-d8403b6d
                                                          ← NEW From-tag (not 865222299)
CSeq: 10 ACK                                              ← wrong number (auth INVITE was 11)
Call-ID: 50741629-44403-2@BCC.BHH.CEG.JC
Max-Forwards: 70
Content-Length: 0
User-Agent: VSP-Phone-v4-Kamailio
CSeq: 10 ACK                                              ← DUPLICATE CSeq header
                                                          ← NO Route headers
```

### Field-by-field verdict

| Field | Required (RFC 3261 / Telnyx) | Wire ACK | Match |
|-------|------------------------------|----------|-------|
| **Call-ID** | Same as INVITE | Same | YES |
| **From-tag** | `865222299` | `64ff6b49…d8403b6d` | **NO** |
| **To-tag** | `XaH8D0p24vKUg` | *(absent)* | **NO** |
| **CSeq number** | `11` (matches auth INVITE) | `10` | **NO** |
| **CSeq uniqueness** | Single CSeq header | **Duplicate CSeq** | **NO** |
| **Request-URI** | Encoded Contact | Encoded Contact | YES |
| **Route** | Reverse of Telnyx Record-Route | *(absent)* | **NO** |
| **Dest socket** | Per Route set (proxy path) or Contact | Direct `10.239.45.24:5070` | Partial |

### Expected ACK shape (Asterisk / FreeSWITCH / RFC-compliant UAC)

Asterisk/FreeSWITCH, as a real UAC on the same trunk, would emit something equivalent to:

```
ACK sip:telnyx*17045502033**10.239.45.24*5070*udp@telnyx.com SIP/2.0
Route: <sip:192.76.120.10;r2=on;lr;ftag=865222299>
Route: <sip:10.255.0.1;r2=on;lr;ftag=865222299>
From: <sip:+13136506292@sip.vspphone.com>;tag=865222299
To: <sip:17045502033@sip.vspphone.com>;tag=XaH8D0p24vKUg
Call-ID: 50741629-44403-2@BCC.BHH.CEG.JC
CSeq: 11 ACK
```

*(Asterisk baseline capture on this host is still pending; the expected shape is required by RFC 3261 §12.2.1.1 and Telnyx Record-Route docs.)*

---

## 3. Why Telnyx treats the ACK as missing

RFC 3261 dialog identity for mid-dialog / ACK-to-2xx:

- **Call-ID**
- **local tag** (From-tag of UAC)
- **remote tag** (To-tag from 200 OK)
- **CSeq** of the INVITE being acknowledged

The transmitted ACK shares Call-ID only. It has:

1. A **different From-tag** → new dialog identity  
2. **No To-tag** → cannot match confirmed dialog  
3. **Wrong CSeq** (10 vs 11)  
4. **Malformed headers** (duplicate CSeq) — Kamailio itself logged parse errors  

Therefore Telnyx’s B2BUA/proxy never associates this packet with the outstanding INVITE transaction, keeps retransmitting 200 OK, and after ~32s sends BYE with ACK Timeout.

This matches Telnyx’s documented behavior:

- [Telnyx P01 / 32s ACK timeout](https://support.telnyx.com/en/articles/4409457-telnyx-sip-response-codes) — broken ACK/BYE dialog routing  
- [Telnyx Record-Route / Route headers](https://support.telnyx.com/en/articles/9133298-sip-record-route-headers) — ACK must carry reversed Route set from 200 OK Record-Route; omitting/misordering Route → ack_timeout  

---

## 4. Mechanism that produced the bad ACK (config behavior, not speculation)

From Kamailio logs for the same Call-ID:

```
carrier ACK TX pre-send ruri=sip:telnyx*...@telnyx.com dst=sip:10.239.45.24:5070 cseq=10
ERROR: parse_headers(): duplicate CSeq header field [CSeq: 10 ACK
ERROR: remove_hf_f(): error while parsing message headers
ERROR: duplicate Max-Forwards header field
carrier tm ACK fallback pre-send ... cseq=<null>
carrier ACK TX sent ... cseq=10
```

Root mechanism:

1. **`uac_req_send()` builds a new local request**, not a TM ACK for the existing UAC INVITE transaction.  
   - `$uac_req(furi)` / default From generates a **new From-tag** (`64ff6b49…`).  
   - `$uac_req(turi)` was set without the **200 OK To-tag**.  
   - CSeq forced via `$uac_req(hdrs)` using stored `10` (pre-auth) while auth INVITE was `11`, and injection creates a **second CSeq** line.

2. **`tm:local-request` also fires** (fallback path) and attempts `remove_hf`/`append_hf` on an already-broken message → `cseq=<null>` log line.

3. Config **strips Telnyx `Record-Route`** on carrier replies (`remove_hf("Record-Route")`), so even a correct TM ACK path would lack the Telnyx-required Route set unless Route is reconstructed deliberately.

Kamailio documentation confirms the architectural mismatch:

- [UAC module](https://www.kamailio.org/docs/modules/stable/modules/uac.html): `uac_req_send()` builds requests from `$uac_req(...)` — not dialog-bound ACK for an existing INVITE.  
- [TM module](https://www.kamailio.org/docs/modules/stable/modules/tm.html): ACK for 2xx on a proxied/`t_relay` INVITE is end-to-end; local auto-ACK applies to `t_uac*` local transactions.  
- [SR-Users: CSeq after uac_auth](https://lists.kamailio.org/pipermail/sr-users/2020-December/111424.html) / [GitHub #1359](https://github.com/kamailio/kamailio/issues/1359): ACK CSeq must track auth-bumped INVITE CSeq via dialog `track_cseq_updates`.

---

## 5. What is *not* the primary defect (ruled out by this capture)

| Hypothesis | Evidence |
|------------|----------|
| ACK never transmitted | **False** — ACK on wire to `10.239.45.24:5070` at T+0.004s after 200 OK |
| Wrong Contact R-URI | **False** — R-URI matches encoded Contact |
| RTP / RTPengine timeout | **False** — teardown is SIP BYE with ACK Timeout |
| Session timers | **False** — no Session-Expires on 200 OK |
| Destination anycast alone | Secondary — dest IP is B2BUA; dialog tags/CSeq fail first |

---

## 6. Asterisk/FreeSWITCH baseline status

- Script: `rc1-evidence/asterisk-telnyx-baseline.sh`  
- **Not yet captured** in this session.  
- Required next evidence step (still **no Kamailio code change**): place one call Asterisk → same Telnyx credential connection, capture ACK, and fill the comparison table with real Asterisk fields.

---

## 7. Correct fix direction (design only — do not implement yet)

Any fix must produce an ACK that is **the same dialog** as the authenticated INVITE/200 OK:

1. From-tag = INVITE From-tag (`865222299`)  
2. To-tag = 200 OK To-tag (`XaH8D0p24vKUg`)  
3. CSeq = authenticated INVITE number (`11 ACK`) — single header only  
4. Prefer **TM’s native ACK for the UAC INVITE transaction** (or relayed desk ACK), **not** a fresh `uac_req_send()` orphan  
5. Preserve / apply Telnyx Record-Route → Route set per Telnyx docs  
6. Exactly one ACK; no dual uac+tm paths; no header surgery that duplicates CSeq/Max-Forwards  

Until a capture shows those fields matching, do not declare the 32s issue resolved.

---

## 8. Supporting artifacts

| Artifact | Location |
|----------|----------|
| Live pcap | `/tmp/teardown-capture-20260728T051730Z/docker.pcap` |
| Prior full ladder | `rc1-evidence/sip-trace-1938501546.txt` |
| This report | `rc1-evidence/RC1-protocol-investigation.md` |
| Kamailio errors | docker logs for Call-ID `50741629` (duplicate CSeq / Max-Forwards) |
| Telnyx CDR | `call_sec=32` for `50741629-44403-2@BCC.BHH.CEG.JC` |

---

## PASS/FAIL (validation)

| Criterion | Pre-fix (50741629) | Post-fix deploy |
|-----------|-------------------|-----------------|
| ACK after 200 OK exists on wire | YES (orphan) | **PENDING** — no Grandstream/Zoiper PSTN test during capture window |
| ACK dialog tags match 200 OK | **FAIL** | **PENDING** |
| ACK CSeq matches auth INVITE | **FAIL** (10 vs 11) | **PENDING** |
| Single ACK, no duplicate CSeq | **FAIL** | **PENDING** |
| Route set present on ACK | **FAIL** | **PENDING** |
| No 200 OK retransmissions | **FAIL** | **PENDING** |
| No 408 ACK Timeout BYE | **FAIL** | **PENDING** |
| call_sec >= 300 | **FAIL** (32) | **PENDING** |

**Overall: FAIL (pre-fix proven) — post-fix validation PENDING.**

Kamailio redeployed healthy at 2026-07-28 ~05:42 UTC (`478cf12`). Capture window `20260728T054246Z` (420s) had no qualifying PSTN calls on Grandstream IP filter; run `rc1-evidence/capture-teardown.sh` while holding Grandstream → PSTN and Zoiper → PSTN for ≥5 minutes each.

---

## 9. Endpoint proof — Grandstream zero ACK (2026-07-28, no Contact changes)

**Full report:** `rc1-evidence/RC1-grandstream-zero-ack-endpoint-proof.md`

Wire summary:

| Call-ID | Phone | Desk 200 OK Contact | Post-200 ACK from phone |
|---------|-------|---------------------|-------------------------|
| `631199326-44403-3@...` | GRP2601 @ 122.177.246.92 | Encoded `@64.16.250.10:5060` | **0** |
| `1938501546-17916-2@...` | GRP2601 @ 122.177.247.143 | Encoded `@telnyx.com`, later decoded `@192.76.120.10` | **0** |
| `uNWK9g7brST6ZZ75eN_fow..` | Zoiper @ 49.43.218.12 | Encoded `@telnyx.com` | BYE uses Telnyx Contact (dialog formed); desk ACK wire **pending paired capture** |

Post-fix call `631199326`: Kamailio logged `carrier Record-Route stored` but **no** `carrier phone ACK relay` — consistent with Grandstream never sending desk ACK.

**Decision gate:** Do not rewrite Contact until Grandstream syslog and/or `endpoint-ack-compare-capture.sh` closes the Zoiper wire-ACK comparison.

---

## 10. Fix implemented — desk-facing 200 OK normalization (2026-07-28)

**Root cause addressed:** Telnyx encoded `Contact` on carrier 200 OK was relayed verbatim to desk → Grandstream sent zero post-200 ACK.

**Change:** `route[DESK_NORMALIZE_CARRIER_REPLY]` in `onreply_route[MANAGE_REPLY]`:

1. Store carrier Contact/Record-Route for ACK relay (unchanged).
2. Strip carrier `Record-Route`.
3. Restore desk `From` + `CSeq` from INVITE snapshot (`$sht(desk_from=>$ci)`, etc.).
4. Replace `Contact` with PBX endpoint: `sip:<extension>@sip.vspphone.com` (not Telnyx Contact).

Desk ACK now targets Kamailio; `route[CARRIER_RELAY_ACK]` rewrites to stored carrier Contact for Telnyx.

**Validation:** `SEC=420 bash rc1-evidence/validate-32s-fix.sh` — requires Grandstream + Zoiper PSTN holds ≥5 min each.
