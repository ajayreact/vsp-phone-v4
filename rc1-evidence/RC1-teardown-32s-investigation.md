# RC1 Investigation: 32-Second Call Teardown (BYE Source)

**Status:** OPEN — wire evidence identifies Telnyx ACK Timeout; fix deployed, **not yet validated** with a 5+ minute call.

## Executive summary (call `757312847-23797-2@BCC.BHH.CEH.BED`)

| Question | Answer |
|----------|--------|
| **First teardown message** | SIP **BYE** from Telnyx at T+32.008s after answer |
| **Who sends it** | **Telnyx** (`192.76.120.10:5060`), CDR `hangup_details=send_bye`, `telnyx_error_code=D00` |
| **BYE Reason header** | `Reason: SIP;cause=408;text="ACK Timeout"` |
| **Session timers** | **None** on wire (no Session-Expires / Min-SE / Supported:timer) |
| **RTPengine** | RTP active until BYE; delete triggered **by** BYE, not before |
| **Root cause (hypothesis)** | Post-answer ACK never accepted: wrong **destination** (anycast `192.76.120.10:5060` vs Contact `10.13.207.4:5070`) and wrong **CSeq** (`10 ACK` vs carrier `11 INVITE` after uac_auth retry) |
| **ACK dedupe alone** | **Did NOT fix** — duplicate UAC ACK was a contributor but not sole cause |

## SIP ladder (pcap `/tmp/teardown-capture-20260726T232701Z/all.pcap`)

| Time (UTC) | Dir | Method | Src → Dst | Notes |
|------------|-----|--------|-----------|-------|
| 23:29:29.916 | In | INVITE | 122.177.247.143:8000 → 172.31.39.116:5060 | Grandstream, CSeq 10 |
| 23:29:29.916 | Out | 100 Trying | Kamailio → phone | |
| 23:29:30.418 | Out | INVITE | Kamailio → 192.76.120.10:5060 | Carrier leg, CSeq **11** (post-auth) |
| 23:29:30.461 | In | 100 Trying | Telnyx → Kamailio | |
| 23:29:32.179 | In | 183 | Telnyx → Kamailio | Contact: `10.13.207.4:5070;transport=udp` |
| 23:29:45.956 | In | **200 OK** | Telnyx → Kamailio | CSeq **11**, Contact: `10.13.207.4:5070` |
| 23:29:45.960 | Out | **ACK** | Kamailio → **192.76.120.10:5060** | R-URI Contact OK, but **CSeq 10 ACK** (wrong) |
| 23:29:46–23:30:17 | In | 200 OK (×8) | Telnyx retransmits | No valid ACK received |
| 23:30:17.957 | In | **BYE** | **192.76.120.10:5060** → Kamailio | CSeq 118000516 BYE, **Reason: ACK Timeout** |
| 23:30:17.961 | Out | BYE | Kamailio → 10.13.207.4:5070 | Relay toward B2BUA Contact |
| 23:30:18.003 | In | 403 Forbidden P01 | Telnyx → Kamailio | Response to relayed BYE |

**Call-ID:** `757312847-23797-2@BCC.BHH.CEH.BED`  
**Telnyx CDR:** `call_sec=32`, `hangup_details=send_bye`, `hangup_code=31`, MOS 4.49 (two-way audio worked)

## Kamailio log (same call, pre-fix)

```
carrier uac ACK ruri=sip:19737862921@10.13.207.4:5070 ouri=sip:192.76.120.10:5060 cseq=10
carrier 200 OK contact=sip:19737862921@10.13.207.4:5070 dst=sip:10.13.207.4:5070;transport=udp
BYE received src=192.76.120.10:5060 ru=sip:19737862921@10.13.207.4:5070 du=...
```

No `carrier local ACK` line — only misdirected uac ACK was sent.

## Ruled out

- Kamailio `dlg_ontimeout` (~83–90s later, not 32s)
- RTPengine RTP timeout (media flowing; delete on BYE)
- NestJS `noAnswerSec:30` (ring phase only)
- Session-Expires / RFC 4028 refresh failure (headers absent)
- Telnyx Call Control webhook (webhook null; not `is_callcontrol`)

## Fix deployed (2026-07-27, pending validation)

1. **Remove** `route(CARRIER_SEND_ACK)` — TM `local-request` only (single ACK)
2. **`CARRIER_STORE_CONTACT`** — `$du` = `sip:10.13.207.4:5070;transport=udp` (Contact socket, not anycast)
3. **Store carrier 200 OK CSeq** — apply in `tm:local-request` (fixes 10 vs 11 after uac_auth)
4. **UDP-only** Telnyx dispatcher (no TCP/UDP mismatch)
5. **Telnyx API** — `encode_contact_header_enabled=true`

## Validation required

Place PSTN test call; confirm in logs:

- `carrier local ACK du=sip:10.13.207.4:5070;transport=udp cseq=11`
- `carrier local ACK sent snd=172.31.39.116:5060` (to Contact IP, not 192.76.120.10)
- **No** `carrier uac ACK`
- Telnyx CDR `call_sec` **>> 32** (target: 5+ minutes)

Scripts: `capture-teardown.sh`, `analyze-call-pcap.sh`, `investigate-32s-call.sh`, `telnyx-cdr-fetch.sh`
