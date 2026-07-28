# RC1 Endpoint Proof: Grandstream Zero Post-200 ACK

**Status:** FIX DEPLOYED (desk-facing 200 OK normalization @ 2026-07-28 ~06:47 UTC) — live validation in progress  
**Date:** 2026-07-28 UTC

---

## Executive verdict

| Question | Answer | Evidence |
|----------|--------|----------|
| Does Grandstream transmit ACK after PSTN 200 OK? | **NO** — zero packets on wire | Two independent calls, two Contact formats |
| Does Grandstream play two-way RTP after 200 OK? | **YES** | rtpengine_answer code=200; call stays up until Telnyx BYE |
| Does Grandstream respond to BYE? | **YES** — `200 OK` to BYE | Call `631199326`, `1938501546` |
| Is ACK lost in transit / Kamailio dropped it? | **NO** — phone never sends it | Only 2 outbound SIP frames from phone in call `1938501546` |
| Zoiper same trunk + encoded Contact? | **Accepts dialog** (BYE R-URI = Telnyx Contact) | Call `uNWK9g7brST6ZZ75eN_fow..` Kamailio log |
| Classification | **Endpoint interoperability (Grandstream)** | Zoiper tolerates forwarded 200 OK; Grandstream suppresses ACK |

**Not proven yet:** Grandstream internal syslog reason string (invalid Contact vs dialog mismatch). Requires phone-side SIP debug (below).

---

## 1. Grandstream wire proof — call `631199326-44403-3@BCC.BHH.CEG.JC`

**Capture:** `/tmp/teardown-capture-20260728T055641Z/docker.pcap` (2026-07-28 06:04–06:16 UTC)  
**Phone:** GRP2601 `122.177.246.92:14822`, firmware 1.0.7.11  
**Post-fix Kamailio** (relay ACK path deployed; no `carrier phone ACK relay` log → no desk ACK arrived)

### Phone → server (entire answered call)

```
06:04:47  INVITE sip:17045502033@sip.vspphone.com   CSeq 20
          (no other outbound SIP until BYE response at 06:05:28)
```

```bash
sudo tcpdump -nn -r docker.pcap | grep '122.177.246.92.14822 >' | grep -iE 'INVITE|ACK|BYE'
# → INVITE only (plus 200 OK to BYE at teardown)
```

### Server → phone — first 200 OK (T+9.08s after INVITE)

```
SIP/2.0 200 OK
Via: ... branch=z9hG4bK526656435
From: "Ajay 100" <sip:100@sip.vspphone.com>;tag=3770869
To: <sip:17045502033@sip.vspphone.com>;tag=6p55UXFyr4QSp
Call-ID: 631199326-44403-3@BCC.BHH.CEG.JC
CSeq: 20 INVITE
Contact: <sip:telnyx*17045502033**10.239.103.228*5070*udp@64.16.250.10:5060>
Record-Route: (absent on desk leg)
```

**Carrier leg (same answer):** CSeq **21** INVITE; Record-Route present (Telnyx path).

### Timeline after 200 OK

| Time (UTC) | Direction | Message |
|------------|-----------|---------|
| 06:04:56.331 | S→Phone | 200 OK (initial) |
| 06:04:56–06:05:27 | S→Phone | 200 OK retransmits (×11) |
| 06:05:28.331 | S→Phone | BYE `Reason: SIP;cause=408;text="ACK Timeout"` |
| 06:05:28.805 | Phone→S | 200 OK (to BYE) |

**ACK count from phone after 200 OK: 0**

---

## 2. Grandstream wire proof — call `1938501546-17916-2@BCC.BHH.CEH.BED` (pre–Contact-rewrite control)

**Artifact:** `rc1-evidence/sip-trace-1938501546.txt`  
**Phone:** GRP2601 `122.177.247.143:23098`

### Phone outbound SIP (full call)

| Timestamp | Message |
|-----------|---------|
| 07:03:21.287 | INVITE CSeq 10 |
| 07:04:11.805 | 200 OK (response to BYE only) |

**No `ACK sip:` from `122.177.247.143` at any point after 200 OK.**  
The only Grandstream-originated ACK in the trace is Kamailio→Telnyx `ACK` for **407** (CSeq 10), not post-200.

### First desk 200 OK (Contact **not** rewritten)

```
Contact: <sip:telnyx*17045502033**10.239.196.24*5070*udp@telnyx.com>
CSeq: 10 INVITE
From: "Ajay 100" <sip:100@sip.vspphone.com>;tag=4567312
Record-Route: (absent)
```

### Later Telnyx retransmits (07:03:47+) — Contact **decoded**, Record-Route **added**

Desk leg retransmitted 200 OK with:

```
Contact: <sip:17045502033@192.76.120.10:5060;transport=udp>
Record-Route: <sip:10.255.0.1;...>, <sip:192.76.120.10;...>, <sip:32.196.41.160;...>
From: <sip:+13136506292@sip.vspphone.com>;tag=4567312   ← differs from INVITE From
CSeq: 10 INVITE
```

**Grandstream still sent zero ACK** even when Contact was a normal `user@host:port` URI and Route set was present.

---

## 3. Phone internal behavior (inferred from wire + media)

| Behavior | Observation |
|----------|-------------|
| **Accepts SDP / starts RTP** | User reports two-way audio; `rtpengine_answer code=200` |
| **Confirms INVITE transaction with ACK** | **Fails** — no ACK on wire |
| **Confirms dialog for mid-call BYE** | Sends 200 OK to BYE with local Contact |
| **Creates ACK internally** | Unknown — no wire egress |
| **Suppresses ACK** | **Consistent with evidence** — stack/media up, signaling dialog incomplete |

Grandstream is not “dead on the wire”; it is **selectively not emitting the post-200 ACK** while still consuming SDP.

---

## 4. Forwarded 200 OK anomalies (desk leg) — candidate rejection triggers

These are present on the wire and are plausible Grandstream stack reject reasons. **Syslog required to confirm which one the phone logs.**

| Check | Call `631199326` | Call `1938501546` (1st 200) | Call `1938501546` (retransmit) |
|-------|------------------|----------------------------|--------------------------------|
| **Invalid / non-RFC Contact** | Telnyx encoded `telnyx*...*` @ `64.16.250.10:5060` | Encoded @ `telnyx.com` | Decoded `@192.76.120.10:5060` |
| **CSeq vs INVITE** | Match (20) | Match (10) | Match (10) |
| **CSeq vs carrier leg** | Mismatch (desk 20 / carrier 21) | Mismatch (10 / 11) | Mismatch (10 / 11) |
| **Record-Route on 200 OK** | Absent | Absent | Present |
| **From header vs INVITE** | Match (`sip:100@`) | Match | **Mismatch** (`+13136506292@`) |
| **Route set for ACK** | No RR on first 200 | No RR | RR present |

**Key point:** Zero ACK persists across **both** encoded and decoded Contact forms → cannot attribute Grandstream silence to Contact rewrite alone. First 200 OK already used `@telnyx.com` with no rewrite.

---

## 5. Zoiper comparison (same extension 100, same Telnyx trunk)

### Available evidence — call `uNWK9g7brST6ZZ75eN_fow..`

| Field | Value |
|-------|-------|
| Client | Zoiper v2.10.20.4 @ `49.43.218.12:64128` |
| Carrier 200 OK Contact | `sip:telnyx*+13174492106**10.239.114.24*5070*udp@telnyx.com` |
| Kamailio | Old path: `sending carrier ACK` (orphan UAC ACK — pre relay fix) |
| Zoiper BYE R-URI | **`sip:telnyx*+13174492106**10.239.114.24*5070*udp@telnyx.com`** |

Zoiper BYE targeting the Telnyx encoded Contact proves the softphone **parsed and stored** that Contact as the remote dialog target — behavior **opposite** to Grandstream (which never ACKs encoded or decoded Contact).

### Gap

No pcap in repo filtered for `49.43.218.12` during that call window. **Desk-leg ACK for Zoiper not yet extracted from wire.** Paired capture required (script below).

### Calls that are **not** valid Zoiper PSTN-200 comparisons

| Artifact | Why excluded |
|----------|--------------|
| `fixval-call-packets.txt` | Zoiper CANCEL before answer; ACKs are for 407/487 |
| `telnyx-carrier-retest.txt` | Kamailio TCP leg ACKs for auth; no answered PSTN 200 |

---

## 6. Task checklist status

| # | Task | Status |
|---|------|--------|
| 1 | Enable full SIP logging on GRP2601 | **Provisioned in API** (`GRANDSTREAM_SYSLOG_HOST=32.196.41.160`, level DEBUG, Send SIP=Yes). Phone must **reprovision + reboot**. Open **UDP/514** from phone IP in SG. |
| 2 | Capture at phone / mirror | **Server mirror done** for Grandstream (`122.177.246.92`). Phone-local PCAP fallback: `grandstream-pcap-fallback.sh` |
| 3 | Accept / reject / ACK / suppress | **Suppress ACK** (wire); **accept SDP** (RTP). Internal reject reason: **pending syslog** |
| 4 | invalid Contact / dialog / Route | **Candidates listed §4** — not phone-confirmed |
| 5 | Zoiper same call path | **Partial** (BYE proves dialog); **desk ACK wire capture pending** |

---

## 7. Next operator steps (no Kamailio Contact changes)

### A. Grandstream syslog (internal reject reason)

```bash
# EC2
cd /opt/vsp-phone-v4/rc1-evidence
export PHONE_IP=122.177.246.92   # current GRP2601 public IP
./grandstream-syslog-check.sh --listen 60
```

Phone: Maintenance → System Diagnosis → Syslog → `32.196.41.160:514`, Level **DEBUG**, **Send SIP Log = Yes** → Save → Reboot.

Place one PSTN call; grep syslog for: `Contact`, `dialog`, `Route`, `ACK`, `invalid`, `reject`.

### B. Paired Zoiper + Grandstream capture

```bash
export PHONE_IP=122.177.246.92
export ZOIPER_IP=49.43.218.12    # set at test time from registrar
export SEC=300
bash rc1-evidence/endpoint-ack-compare-capture.sh
```

Place **Zoiper → PSTN** first (hold ≥60s), then **Grandstream → PSTN** (hold ≥60s). Script reports post-200 ACK count per endpoint.

### C. Pass criteria before any Contact rewrite

1. Grandstream syslog shows explicit reject reason for 200 OK, **or**
2. Paired capture shows Zoiper desk ACK + Grandstream zero ACK on **identical** desk 200 OK shape (proves endpoint-only), **or**
3. Both endpoints zero ACK on identical 200 OK (would implicate forwarded 200 OK — **not supported by current Grandstream-only evidence**)

---

## 8. Decision gate

| Outcome | Action |
|---------|--------|
| Zoiper ACKs, Grandstream does not (same 200 OK) | Fix desk-facing 200 OK for GRP2601 compatibility **without guessing** — use syslog + field diff |
| Neither ACKs | Fix Kamailio forwarded 200 OK (Contact/RR/CSeq/From consistency) |
| Grandstream syslog: invalid Contact | Evaluate Contact normalization **after** proof doc accepted |

**Current recommendation:** Do **not** rewrite Contact yet. Grandstream fails on **both** `@telnyx.com` and `@64.16.250.10` encoded forms; root cause is likely **Telnyx encoded Contact URI** + Grandstream strict parser, but syslog + Zoiper wire ACK remain required for a closed proof.

---

## Artifacts

| Item | Path |
|------|------|
| Latest Grandstream pcap | `/tmp/teardown-capture-20260728T055641Z/docker.pcap` |
| Pre-fix ladder | `rc1-evidence/sip-trace-1938501546.txt` |
| Syslog preflight | `rc1-evidence/grandstream-syslog-check.sh` |
| Phone PCAP fallback | `rc1-evidence/grandstream-pcap-fallback.sh` |
| Paired capture | `rc1-evidence/endpoint-ack-compare-capture.sh` |
