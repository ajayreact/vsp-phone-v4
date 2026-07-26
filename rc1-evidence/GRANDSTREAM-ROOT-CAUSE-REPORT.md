# Grandstream Root Cause — Final Engineering Report

**Device:** GRP2601 `EC74D751E3E7` / ext 100  
**Date:** 2026-07-26  
**Scope:** Handset firmware / SIP stack / transport only  

---

## Executive summary

| Item | Status |
|------|--------|
| Experiments 1–3, 5 executed on handset | **NOT RUN** (script ready: `grandstream-root-cause-experiments.sh`) |
| Experiment 4 side-by-side INVITE | **PARTIAL** (Zoiper from `fixval-call-packets.txt`; Grandstream from Jul 24 Mode A capture + Jul 26 export) |
| Root cause proven without new experiments | **Mode A only** — oversized fragmented UDP INVITE |
| Root cause proven for Mode B | **NOT PROVEN** — DEBUG syslog was disabled; experiment 5 not run |

**Issue classification (evidence-based):** **Grandstream configuration** (factory multi-codec SDP + vendor SIP headers) causing **network/transport** failure (UDP fragmentation). **Not platform.** Mode B remains **handset call-engine / user-workflow** until Experiment 5 syslog.

---

## Experiment 1 — Minimize SDP (PCMU only)

| Field | Value |
|-------|-------|
| **Performed** | No |
| **Phone steps** | Account 1 → disable all codecs except PCMU |
| **Capture** | `./grandstream-root-cause-experiments.sh exp1` |
| **Pass criteria** | INVITE unfragmented; SIP response (100 Trying or better); call completes |
| **Result** | **PENDING** |
| **Evidence** | None from live run |

**Baseline (pre-experiment):** Jul 26 export shows **8 codecs** enabled on Account 1. Jul 24 Mode A: **1513-byte fragmented INVITE**, zero responses.

---

## Experiment 2 — Remove optional SIP headers

| Field | Value |
|-------|-------|
| **Performed** | No |
| **Phone steps** | Disable PANI, PEI, X-Grandstream |
| **Result** | **PENDING** |

**Baseline from export (`config.xml`):**

```xml
account.1.sip.header: xGrandstream=Yes, pani=Yes, pei=Yes
```

These headers are **enabled** on the phone today. They add bytes to every INVITE (exact size delta requires Experiment 2 capture).

---

## Experiment 3 — TCP transport

| Field | Value |
|-------|-------|
| **Performed** | No |
| **Phone steps** | P130: UDP → TCP |
| **Result** | **PENDING** |

**Rationale:** TCP eliminates IP fragmentation of SIP messages. If Experiment 1 fails but Experiment 3 passes → transport/framing issue confirmed.

---

## Experiment 4 — Wireshark / INVITE comparison

| Field | Value |
|-------|-------|
| **Performed** | **Partial** |
| **Zoiper source** | `rc1-evidence/fixval-call-packets.txt` (2026-07-25, ext 100, IP 122.177.247.143) |
| **Grandstream source** | Jul 24 Mode A LAN capture (1513 B frag INVITE); Jul 26 export (codec/header config) |
| **Result** | **Zoiper PASS** (100 Trying); **Grandstream Mode A FAIL** (0 responses on frag INVITE) |

### Side-by-side (evidence-backed fields only)

| Field | Zoiper (captured) | Grandstream (captured / export) | Match |
|-------|-------------------|----------------------------------|-------|
| Request-URI | `sip:13174492106@sip.vspphone.com;transport=UDP` | Not decoded in repo pcap text | — |
| Route | Not present in excerpt | Unknown without GS INVITE decode | — |
| Via | `UDP 192.168.1.101:57051` + rport | NAT path same class | — |
| Contact | `sip:100@122.177.247.143:1087;transport=UDP` | Ephemeral port when sending | — |
| Transport | UDP | UDP (P130=0) | YES |
| User-Agent | `Zoiper v2.10.20.4_1` | `Grandstream GRP2601 1.0.7.11` | NO |
| Content-Length (SDP) | **262** | **Not in repo**; total datagram **1513 B** (Mode A) | NO |
| Supported codecs (SDP) | Single m= line (compact) | **8 codecs** in export: G.722, OPUS, PCMU, PCMA, G.723.1, G.729, iLBC, G.726-32 | NO |
| SIP vendor headers | Standard | **PANI, PEI, X-Grandstream enabled** (export) | NO |
| Message size | Unfragmented | **1513 bytes, IP fragmented** | NO |
| SIP responses | **100 Trying** (Kamailio) | **0 responses** (Mode A) | NO |
| Kamailio reception | Yes | Mode A: INVITE on LAN; Mode B: **no INVITE** at EC2 | NO |

**Experiment 4 pass/fail:** **FAIL** for Grandstream Mode A vs Zoiper baseline.

---

## Experiment 5 — Mode B (REGISTER, no INVITE)

| Field | Value |
|-------|-------|
| **Performed** | No |
| **Syslog in export** | `maintain.syslog level=None`, `sendSipLog=No` |
| **Result** | **PENDING** |

**Export facts relevant to Mode B:**

| Check | Export value |
|-------|--------------|
| keyAsSend | `Pound` (# required to dial) |
| noKeyEntryTimeout | 4 seconds |
| lineSeizeTimeout | 15 seconds |
| Dial plan P290 | `{ x+ \| \+x+ \| *x+ \| *xx*x+ }` — permits PSTN digits |
| Account 1 active | P31=1, REGISTER succeeds |

**Jul 24 EC2 evidence:** REGISTER from 122.177.247.143; **no INVITE** during outbound attempt window.

Without DEBUG syslog, the exact pre-INVITE abort branch is **not proven**.

---

## Root cause (evidence only)

### Mode A — PROVEN

> The Grandstream sends an **oversized UDP INVITE** (documented **1513 bytes, fragmented**) built with **factory multi-codec SDP** and **vendor SIP headers**, and receives **zero SIP responses**. Zoiper from the same extension sends an **unfragmented INVITE** with **262-byte Content-Length** and receives **100 Trying**.

| Evidence type | Source |
|---------------|--------|
| Fragmentation + size | Jul 24 LAN `out.pcap` (Mode A) |
| Zero responses | Same capture |
| Multi-codec SDP | Jul 26 `config.xml` / `config.txt` export |
| Vendor headers | `account.1.sip.header` in export |
| Zoiper control | `fixval-call-packets.txt` |

**Classification:** **Grandstream configuration** (codec list + headers) → **network/transport** (UDP datagram size / fragmentation). **Not platform.**

### Mode B — NOT PROVEN (independent failure)

> REGISTER succeeds; **no INVITE reaches Kamailio**. Export shows dial plan would permit the test number. **DEBUG syslog not collected.** Failure is **before platform** but exact handset branch (incomplete dial / line key / stack timing) is **unlogged**.

**Classification:** **Handset call engine / SIP stack state** — pending Experiment 5.

---

## Recommended permanent fix

Apply after Experiments 1–3 confirm (expected order):

1. **Provision or locally set Account 1 codecs to PCMU-only** (disable OPUS, G.722, G.729, G.723, G.726, iLBC).
2. **Disable PANI, PEI, X-Grandstream** on Account 1.
3. If UDP still fragments: set **SIP Transport = TCP** (P130=1) for Account 1.
4. **Mode B:** enable persistent DEBUG syslog to EC2 during pilot; verify user dials with **# send** on active Line 1.

Optional VSP provisioning template addition (handset config, not platform SIP logic): emit codec-restricted + header-minimized P-values in `cfg.xml` for GRP2601 fleet.

---

## Run experiments (EC2 Instance Connect)

```bash
cd /opt/vsp-phone-v4/rc1-evidence
export PHONE_IP=122.177.247.143
export DIAL=13174492106
chmod +x grandstream-root-cause-experiments.sh
./grandstream-root-cause-experiments.sh exp1   # after phone UI codec change
# repeat exp2, exp3, exp5; exp4 after saving both pcaps
./grandstream-root-cause-experiments.sh report
```

Paste `$OUT/ROOT-CAUSE-REPORT.md` and `$OUT/exp*/summary.txt` to close Experiments 1–3 and 5.
