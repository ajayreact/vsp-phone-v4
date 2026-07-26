# RC1 Investigation: 32-Second Call Teardown (BYE Source)

**Status:** Root cause identified with CDR + Kamailio log correlation. Fix deployed: dedupe carrier UAC ACK (4× → 1×).

## Executive summary

| Question | Answer |
|----------|--------|
| **First teardown message** | SIP **BYE** (when Telnyx completes teardown on A-leg); PSTN B-leg drops at T+32s on all samples |
| **Who sends it** | **Telnyx** (`hangup_details=send_bye` on every 32s CDR) |
| **Not the cause** | Kamailio dialog timeout (~83–90s later), RTPengine RTP timeout (~60s after media stop), NestJS `noAnswerSec:30` (ring only), Session-Expires (not observed on wire) |
| **Root cause** | Telnyx tears down at **call_sec=32** (`hangup_details=send_bye`). Post-fix call `757312847` proved **two ACKs** still sent: TM `carrier local ACK` + one `carrier uac ACK` → BYE from `192.76.120.10` at T+32s. |
| **Fix** | Store Contact once; **do not** call `CARRIER_SEND_ACK` — let TM send a single local ACK via `tm:local-request` only. |

See `telnyx-cdr-fetch.sh`, `capture-teardown.sh`, `telnyx-webhook-check.sh` for reproducible evidence collection.
