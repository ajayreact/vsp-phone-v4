# SIP Protocol Audit — Grandstream → Kamailio → RTPengine → Telnyx → PSTN

**Role:** Independent Senior SIP Protocol Engineer (read-only audit; no code changes in this document)  
**Date:** 2026-07-30  
**Branch:** `release/v4.0.0-rc1`  
**Primary wire evidence:** `rc1-evidence/sip-trace-1938501546.txt` + `pcap-1938501546.pcap`  
**Call-ID under audit:** `1938501546-17916-2@BCC.BHH.CEH.BED`  
**Method:** Packet-first. Prior written diagnoses are treated as *suspect* until re-proven against RFC text and this capture.

---

## 0. Executive findings (evidence-backed)

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| F1 | Implementation under capture was a **stateful SIP proxy**, not a B2BUA | **DEFINITELY CAUSING** | Same Call-ID + From-tag both legs; two Via; phone Contact on carrier INVITE |
| F2 | Telnyx dialog **remote target (Contact)** was the **desk phone behind NAT**, not the PBX | **DEFINITELY CAUSING** | Carrier INVITE `Contact: sip:100@122.177.247.143:23098` |
| F3 | Desk 200 OK **Contact was Telnyx’s encoded B2BUA URI** (RFC1918 decode target) | **DEFINITELY CAUSING** (10s delay / fragile ACK) | Desk 200 `Contact: sip:telnyx*…**10.239.196.24*5070*udp@telnyx.com` |
| F4 | Telnyx **retransmitted 200 OK many times**; no accepted ACK on carrier dialog | **DEFINITELY CAUSING** (32s BYE) | Trace: 200 OK from `07:03:39.544` onward, repeated; later BYE with ACK Timeout class |
| F5 | Kamailio inserted itself into Telnyx **Record-Route** on the carrier INVITE | **POTENTIALLY PROBLEMATIC** | RR hop `sip:32.196.41.160;lr=on;…` in Telnyx 183/200 |
| F6 | Auth CSeq on carrier (11) ≠ desk CSeq (10); desk 200 rewritten to CSeq 10 | **POTENTIALLY PROBLEMATIC** | Hybrid identity surgery; Asterisk never does this |
| F7 | RFC 4028 Session Timers **not negotiated** on this call | **HARMLESS** for 32s drop | No `Session-Expires` / `timer` in Supported/Require on Telnyx 200 |
| F8 | RFC 3262 (100rel/PRACK) **not in use** | **HARMLESS** | Neither side required 100rel; 183 was informational |
| F9 | TM `local_ack_mode=0` does **not** auto-ACK `t_relay` INVITEs | **DEFINITELY CAUSING** under hybrid | Kamailio TM docs: local ACK only for `t_uac*` / UAC API |
| F10 | Post-2026-07-30 “true B2BUA” (`uac_req_send`) is **not proven on wire** | **OPEN** | No ≥600s PCAP / Telnyx CDR yet; prior hybrid PCAPs remain the failure evidence |

**Root cause (one sentence, packet-backed):**  
Under the hybrid path that produced the failure PCAPs, Kamailio **proxied the Grandstream INVITE to Telnyx** (same dialog identity), so Telnyx’s dialog depended on a **NAT desk Contact** and an **ACK that Grandstream never delivered correctly to Telnyx’s Route set**. Telnyx Timer H (~32s) then tore the call down with ACK Timeout. Asterisk never exhibits this because it is a **UAC** that owns Contact and ACK (~1 ms).

---

## 1. Architecture classification (what we actually were)

### 1.1 Wire identity (Call-ID `1938501546`)

| Hop | From-tag | Call-ID | Contact on INVITE/200 | Via stack |
|-----|----------|---------|----------------------|-----------|
| Desk → Kamailio INVITE | `4567312` | `1938501546-…` | `sip:100@122.177.247.143:23098` | Phone only |
| Kamailio → Telnyx INVITE | `4567312` (same) | **same** | **same phone Contact** | Kamailio + phone |
| Telnyx → Kamailio 200 | `4567312` | **same** | Encoded `telnyx*…@telnyx.com` | Echoed |
| Kamailio → Desk 200 | Restored desk From; **same To-tag** | **same** | **Telnyx encoded Contact leaked to desk** | Phone Via only |

**RFC 3261 §12.1.1:** Contact in dialog-creating requests/responses establishes the **remote target** for subsequent mid-dialog requests (including ACK for 2xx in UAC behavior when the UAC owns the dialog).

**Asterisk / FreePBX (PJSIP UAC):** Separate Call-ID on trunk leg; Asterisk Contact; Asterisk generates ACK locally. Desk dialog is a *different* dialog.

**Verdict:** Captured system = **proxy**. Intended “PBX” behavior = **B2BUA**. Naming in config comments does not change wire identity.

### 1.2 Ladder (compressed, from `sip-trace-1938501546.txt`)

```
t+0.000  GS → Kam   INVITE CSeq:10  Contact=phoneNAT  Call-ID=A
t+0.000  Kam → GS   100 Trying
t+0.093  Kam → Tly  INVITE CSeq:10  Contact=phoneNAT  Call-ID=A  RR=Kam  Via=Kam,GS
t+…      Tly → Kam  407
t+…      Kam → Tly  ACK CSeq:10
t+…      Kam → Tly  INVITE CSeq:11 + Proxy-Authorization  Contact=phoneNAT  Call-ID=A
t+18.26  Tly → Kam  200 OK CSeq:11  Contact=encoded  RR=Telnyx,Telnyx,Kam
t+18.26  Kam → GS   200 OK CSeq:10  Contact=encoded(!)  RR stripped
         … Telnyx retransmits 200 OK repeatedly …
t+~50    Tly → Kam  BYE  Reason ≈ ACK Timeout   (~32s after first 200)
```

Timestamps: INVITE `07:03:21.287` → first carrier 200 `07:03:39.544` (answer/ring), then multi-second 200 retransmissions = **ACK not accepted**.

---

## 2. RFC 3261 deviations

| ID | Clause | Requirement | Observed | Class |
|----|--------|-------------|----------|-------|
| D1 | §12.1.1 / §8.1.1.8 | UAC Contact must be a URI where the UAC can be reached for mid-dialog requests | Carrier INVITE Contact = **Grandstream NAT address**, unreachable as Telnyx remote target for ACK ownership by PBX | **DEFINITELY** |
| D2 | §13.2.2.4 / §17.1.1 | UAC must send ACK for 2xx; retransmissions of 2xx continue until ACK | Many 200 OK retransmissions; Telnyx eventually BYE | **DEFINITELY** |
| D3 | §12.2.1.1 / §16.12 | In-dialog requests use Route set from Record-Route; next hop = first Route (loose routing) | Hybrid ACK path historically sent UDP toward wrong next hop when `$du` null (prior audit); Asterisk always hits `192.76.120.10` | **DEFINITELY** (hybrid) |
| D4 | §16.6 / proxy Record-Route | Proxy MAY Record-Route; UAC SHOULD NOT | Kamailio `record_route` on carrier INVITE inserted PBX into Telnyx RR | **POTENTIAL** |
| D5 | §20.10 / Via | Proxy adds Via; UAC uses single Via | Carrier INVITE retained **phone Via** under Kamailio Via → Telnyx sees proxy, not UAC | **POTENTIAL** (diagnostic of proxy mode) |
| D6 | Dialog matching | Mid-dialog requests share Call-ID + tags | Intentional for proxy; **forbidden pattern** if claiming B2BUA parity with Asterisk | Architecture, not RFC bug *as proxy* |
| D7 | §21.1.1 | 100 Trying | Present | Harmless / compliant |
| D8 | Digest §22 | 407 → ACK → auth INVITE CSeq+1 | Observed CSeq 10→11 | Compliant *as auth*, but forces hybrid CSeq rewrite toward desk |

**Note on “as proxy, is it legal?”**  
Yes: a pure proxy *may* relay desk INVITE to Telnyx. The failure is not “proxy is illegal”; it is **interop failure with Telnyx + Grandstream** under that topology (Contact/ACK ownership). Asterisk avoids the class of failure by **not** being a proxy on the trunk leg.

---

## 3. RFC 3262 (Reliability of Provisional Responses)

| Check | Result |
|-------|--------|
| `Require: 100rel` on 18x | **Absent** on Telnyx 183 in capture |
| Grandstream `Supported` | `replaces,path` — **no 100rel** |
| PRACK exchange | **None** |

**Class:** HARMLESS for the 10s/32s failure. No PRACK dependency.

---

## 4. RFC 4028 (Session Timers)

| Check | Result |
|-------|--------|
| `Session-Expires` on INVITE/200 | **Absent** in carrier 200 bodies examined |
| `Supported: timer` / `Require: timer` | **Absent** (`Supported: path` only on Telnyx 200) |
| Kamailio `sst` / session-timer module | **Not loaded** |
| 32s timing | Matches **Timer H** (64×T1 ≈ 32s) / Telnyx **ACK Timeout**, not Session-Expires refresh |

Config only **logs** Session-Expires if present (`CARRIER_STORE_CONTACT`); it does not implement refresher logic.

**Class:** HARMLESS for this teardown class. Do not chase Session Timers as the 32s root cause without a capture that actually contains `Session-Expires` and a BYE with timer-related Reason.

---

## 5. Kamailio module / best-practice deviations

| Module | Setting / use | Best practice / docs | Deviation | Class |
|--------|---------------|----------------------|-----------|-------|
| **tm** | Carrier via `t_relay` of desk INVITE | Trunk UAC should be `t_uac*` / `uac_req_send` | Hybrid | **DEFINITELY** |
| **tm** | `local_ack_mode=0` | RFC-conformant for **local** UAC txs only | Does **not** ACK `t_relay` 200s | **DEFINITELY** under hybrid |
| **tm** | `fr_inv_timer=120000` | OK | — | Harmless |
| **rr** | `enable_full_lr=1`, `append_fromtag=1` | Common | OK | Harmless |
| **rr** | `record_route()` on BRIDGE_CARRIER | Asterisk UAC inserts **no** PBX RR on trunk | Extra RR hop | **POTENTIAL** |
| **dialog** | `track_cseq_updates=1` + `dlg_manage` | Needed for `uac_auth` CSeq on hybrid | Compensates hybrid pathology | **POTENTIAL** (complexity) |
| **uac** | `credential` + `uac_auth` in failure_route | Correct for **proxied** auth | Wrong tool for `uac_req_send` without `auser`/`apasswd` | **DEFINITELY** (B2BUA attempt) |
| **uac** | Recent `uac_req_send` dual Call-ID | Matches Asterisk topology **if** ACK local | Not wire-proven ≥600s | OPEN |
| **registrar / usrloc** | Desk REGISTER | OK | — | Harmless |
| **nathelper** | `nat_uac_test` / `fix_nated_*` | OK for desk | Must not leak phone Contact to Telnyx | **POTENTIAL** |
| **path** | WSS Path | OK | — | Harmless |
| **outbound** | **Not loaded** | Optional RFC 5626 | N/A for UDP desk | Harmless for this call |
| **dispatcher** | set 2 → Telnyx | OK | — | Harmless |
| **rtpengine** | offer/answer with `via-branch=extra` | OK for media anchor | Secondary to SIP ACK | Secondary |
| **b2b_logic / b2b_entities** | **Not used** | Official Kamailio B2BUA | Custom htable B2BUA instead | **POTENTIAL** (maintainability) |

**Kamailio TM documentation (local_ack_mode):** applies only to transactions created via `t_uac*`. Relayed INVITEs are **not** locally ACKed. That single fact falsifies any claim that “`local_ack_mode=0` means we ACK Telnyx like Asterisk” while still using `t_relay`.

---

## 6. Telnyx integration guidance deviations

Sources: [SIP Record-Route](https://support.telnyx.com/en/articles/9133298-sip-record-route-headers), [SIP response codes / P01 ~32s](https://support.telnyx.com/en/articles/4409457-telnyx-sip-response-codes), [Connection types](https://support.telnyx.com/en/articles/4245868-sip-connection-types), [Connection settings](https://support.telnyx.com/en/articles/4351104-sip-connection-settings).

| Guidance | Our capture / config | Class |
|----------|----------------------|-------|
| ACK must reverse Record-Route; wrong Route → dialog breakage / ack_timeout | Hybrid ACK path repeatedly failed acceptance; 32s class matches ack_timeout | **DEFINITELY** |
| Credential connection challenges outbound INVITE with 407 | Observed; forces CSeq bump | Expected |
| IP auth available for static egress (`32.196.41.160`) | Still using **credential** connection | **POTENTIAL** (eliminating 407 removes hybrid CSeq skew) |
| Contact username on first INVITE helps AnchorSite for credential connections | Carrier Contact used **desk user `100`**, not trunk username | **POTENTIAL** (media site selection / identity) |
| Encode Contact (`telnyx*…@telnyx.com`) — ACK R-URI stays encoded; UDP next hop is SBC | Hybrid historically confused Contact host vs Route next hop | **DEFINITELY** when `$du` targeted wrong place |
| Park Outbound Calls → early 180 without B-leg | Not indicated as enabled in failure PCAPs (PSTN **did** ring) | Harmless for this symptom set |

---

## 7. Packet comparison — Kamailio (failure) vs Asterisk (reference requirements)

Asterisk reference scripts exist (`asterisk-telnyx-baseline.sh`, `pbx-interop-test.sh`, `compare-pbx-ladders.py`). Prior FreePBX comparison docs require ACK ownership ≈1 ms and separate trunk Call-ID.

| Field | Asterisk UAC (required / documented) | Kamailio hybrid (`1938501546`) | Match? |
|-------|--------------------------------------|--------------------------------|--------|
| Trunk Call-ID | **New** | **Same as desk** | **NO** |
| Trunk From-tag | Asterisk-generated | **Desk tag reused** | **NO** |
| Trunk Contact | Asterisk IP:port | **Phone NAT** | **NO** |
| Via count on trunk INVITE | 1 (Asterisk) | 2 (Kamailio+phone) | **NO** |
| Record-Route by PBX | None | Kamailio RR present | **NO** |
| ACK source | Asterisk TM/UAC | Depends on desk ACK + rewrite | **NO** |
| ACK latency after 200 | ~1 ms | Seconds / missing | **NO** |
| Desk 200 Contact | Asterisk/PBX | Telnyx encoded URI | **NO** |
| Auth | Local UAC digest | `uac_auth` on relayed tx | Different mechanism |
| Media | Asterisk or external | RTPengine | Different; secondary |

**Every “NO” above is a functional divergence.** The first three (Call-ID, Contact, ACK ownership) are sufficient alone to explain Telnyx ACK Timeout; the rest are consequences or amplifiers.

---

## 8. Symptom mapping (10s delay + 32s drop)

| Symptom | Mechanism (packet-backed) | Class |
|---------|---------------------------|-------|
| Mobile rings / answer works | Telnyx B-leg established; 183/200 with SDP arrived | Expected |
| ~10s before desk timer / audio | Desk 200 Contact unusable / late or missing desk ACK; media path waits on confirmed dialog + rtpengine answer race | **DEFINITELY** linked to F3 + F4 |
| ~32s BYE from Telnyx | Timer H / ack_timeout after unacked 200 | **DEFINITELY** F4 |
| Prior “fixes” (ACK rewrite, CSeq, Route, `$du`) | Attempted to make a **proxy** behave like a **UAC** without changing dialog ownership | Why symptoms survived |

---

## 9. Current code state vs audit (honest status)

As of 2026-07-30 local/deployed `kamailio.cfg`:

- Intended path: `BRIDGE_CARRIER` → `t_suspend` desk + `uac_req_send` carrier (`.b2b` Call-ID) + absorb desk ACK.
- Auth for UAC: `$uac_req(auser)` / `apasswd` (required; `uac_auth`+`t_relay` is the hybrid pattern).
- Fail codes via htable ints (avoids TM 500 from `get_int_fparam`).

**This audit does not certify that path.** Certification requires:

1. PCAP with **separate** desk vs carrier Call-IDs  
2. Carrier ACK from Kamailio to `192.76.120.10` within **&lt;50 ms** of 200  
3. **No** `Reason: ACK Timeout` BYE  
4. Hold **≥600 s** + manual BYE  
5. Telnyx CDR `call_sec >= 600`  
6. Side-by-side Asterisk baseline with same credentials  

Until those artifacts exist, treat B2BUA as **implemented in config, unproven on wire**.

---

## 10. What is *not* the root cause (ruled out by this capture)

| Hypothesis | Why ruled out |
|------------|---------------|
| RFC 4028 session timer expiry | No Session-Expires negotiation; 32s = Timer H class |
| RFC 3262 PRACK failure | 100rel not required/used |
| NestJS routing reject | Call reached Telnyx; PSTN rang |
| RTPengine as primary teardown | Telnyx BYE after SIP 200 retransmissions; media secondary |
| “Wrong CSeq alone” | CSeq on auth INVITE was correct (11); problem is ACK acceptance / ownership |
| Grandstream “broken in general” | Same phone works against Asterisk-class UAC in interop references; Contact/ACK topology differs |

---

## 11. Required next actions (capture campaign — no coding until gates ready)

1. **Freeze narrative:** Root cause = **proxy dialog ownership (F1–F4)**, not another header tweak.  
2. **Asterisk baseline** on EC2 (`asterisk-telnyx-baseline.sh`) — same Telnyx credentials — capture ACK ≤50 ms.  
3. **Kamailio B2BUA validation** (`validate-b2bua-carrier.sh` SEC=900) — Grandstream → PSTN hold ≥10 min.  
4. **Diff ladders** with `compare-pbx-ladders.py` until functionally equivalent.  
5. **Only then** implement residual gaps found by the diff (not speculative header edits).  
6. Publish PCAP + ladder + Telnyx CDR proving `call_sec >= 600`.

---

## 12. References

- RFC 3261 §§8.1.1.8, 12.1.1, 12.2.1.1, 13.2.2.4, 16.6, 16.12, 17.1.1, 22  
- RFC 3262 (100rel) — not applicable here  
- RFC 4028 (Session Timers) — not negotiated here  
- Kamailio TM `local_ack_mode` — local UAC transactions only  
- Kamailio UAC `$uac_req(auser|apasswd)` for `uac_req_send` auth  
- Telnyx Record-Route / SIP response code articles (links in §6)  
- Repo evidence: `sip-trace-1938501546.txt`, `RC1-freepbx-reference-comparison.md`, `RC1-grandstream-zero-ack-endpoint-proof.md`

---

## Appendix A — Contact leak (desk 200 OK excerpt)

From `sip-trace-1938501546.txt` after first carrier 200:

```
SIP/2.0 200 OK
… Call-ID: 1938501546-17916-2@BCC.BHH.CEH.BED
CSeq: 10 INVITE
Contact: <sip:telnyx*17045502033**10.239.196.24*5070*udp@telnyx.com>
```

Grandstream is told its dialog peer is an **encoded Telnyx URI** whose decode is **RFC1918 `10.239.196.24`**. That is not a reachable PBX Contact. This alone predicts late/missing desk ACK and media confirmation delay.

## Appendix B — Carrier INVITE Contact (ownership leak)

```
INVITE sip:+17045502033@sip.telnyx.com SIP/2.0
… Call-ID: 1938501546-17916-2@BCC.BHH.CEH.BED
Contact: "Ajay 100" <sip:100@122.177.247.143:23098>
```

Telnyx’s view of the UAC Contact is the **desk phone**, while Kamailio simultaneously rewrites From/auth as the trunk. Split brain: signaling identity ≠ Contact owner.
