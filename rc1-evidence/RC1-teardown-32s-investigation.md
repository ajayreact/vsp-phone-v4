# RC1 Investigation: 32-Second Call Teardown (BYE Source)

**Status:** Root cause identified with CDR + Kamailio log correlation. Fix deployed: dedupe carrier UAC ACK (4× → 1×).

## Executive summary

| Question | Answer |
|----------|--------|
| **First teardown message** | SIP **BYE** (when Telnyx completes teardown on A-leg); PSTN B-leg drops at T+32s on all samples |
| **Who sends it** | **Telnyx** (`hangup_details=send_bye` on every 32s CDR) |
| **Not the cause** | Kamailio dialog timeout (~83–90s later), RTPengine RTP timeout (~60s after media stop), NestJS `noAnswerSec:30` (ring only), Session-Expires (not observed on wire) |
| **Root cause** | Telnyx tears down the A-leg **32 seconds after answer** because the **post-answer ACK transaction is broken**. Kamailio sent **4 duplicate UAC ACKs** per 200 OK (parallel `onreply_route` workers). Telnyx documents this exact 32s symptom for invalid/duplicate ACK (P01). |
| **Fix** | `carrier_ack_sent` htable guard — store Contact + `CARRIER_SEND_ACK` **once** per Call-ID |

See `telnyx-cdr-fetch.sh`, `capture-teardown.sh`, `telnyx-webhook-check.sh` for reproducible evidence collection.
