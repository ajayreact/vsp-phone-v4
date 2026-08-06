# RC1 A-prime validation report

**Architecture:** Kamailio edge proxy + Asterisk B2BUA carrier core ([ADR-045](../docs/ADR/ADR-045-asterisk-b2bua-carrier-core.md))
**Commit under test:** _fill from `git rev-parse HEAD` on EC2_
**Run directory:** _fill from `rc1-evidence/adr045-runs/<STAMP>`_
**Date of call:** _fill_

> **Status: NOT RUN.** Every cell below is unproven until the deploy gates pass and one
> Grandstream → PSTN call has been captured, answered, held for ≥ 600 s and hung up
> manually. Nothing in this file may be marked PASS on the basis of container health.

---

## 1. Verdict

| Item | Result | Evidence |
|------|--------|----------|
| Architecture (separate legs, Asterisk owns the carrier dialog) | NOT RUN | analyzer gates 1–2 |
| Separate dialogs (carrier Call-ID ≠ desk Call-ID) | NOT RUN | analyzer gate 3 |
| Carrier ACK | NOT RUN | analyzer gate 8, measured latency below |
| Ringback | NOT RUN | analyzer gate 6 |
| Answer delay | NOT RUN | `answer_delay_ms` |
| Two-way audio | NOT RUN | analyzer gates 14–16 |
| 32-second issue | NOT RUN | analyzer gate 18 |
| 10-minute hold | NOT RUN | `call_seconds` ≥ 600 |
| Normal hangup | NOT RUN | BYE + 200 OK on both legs |
| RTP | NOT RUN | `rtp,streams` |
| Security isolation | NOT RUN | deploy gates D10–D11, analyzer gates 23–24 |
| Telnyx CDR | NOT RUN | Telnyx portal, carrier Call-ID |
| **Overall** | **NOT RUN** | — |

## 2. Measurements

| Measurement | Target | Measured |
|---|---|---|
| Telnyx 200 OK timestamp | — | _fill_ |
| Asterisk carrier ACK timestamp | — | _fill_ |
| **ACK latency** | **< 50 ms** | _`ack_latency_ms`_ |
| Answer propagation (carrier 200 OK → desk 200 OK) | < 1000 ms | _`answer_delay_ms`_ |
| Call duration | ≥ 600 s | _`call_seconds`_ |
| Carrier 200 OK retransmissions | 0 | _fill_ |
| Carrier ACK count | exactly 1 | _fill_ |
| Telnyx CDR duration | ≥ 600 s | _fill_ |

## 3. Gate-by-gate

Filled from `rc1-evidence/adr045-analyze.sh` output (`summary.txt` in the run directory).

| # | Gate | Result | Note |
|---|------|--------|------|
| 1 | Asterisk receives the outbound call from Kamailio | NOT RUN | |
| 2 | Asterisk creates a separate carrier SIP dialog | NOT RUN | |
| 3 | Carrier Call-ID differs from desk Call-ID | NOT RUN | |
| 4 | Asterisk owns carrier From/To tags | NOT RUN | |
| 5 | Asterisk owns carrier CSeq | NOT RUN | |
| 6 | Telnyx 180/183 reaches Asterisk and propagates to the phone | NOT RUN | |
| 7 | Telnyx 200 OK reaches Asterisk | NOT RUN | |
| 8 | Asterisk ACKs Telnyx immediately | NOT RUN | |
| 9 | Exactly one valid carrier ACK | NOT RUN | |
| 10 | No repeated Telnyx 200 OK after the ACK | NOT RUN | |
| 11 | No ACK timeout / provider teardown | NOT RUN | |
| 12 | Grandstream receives the correct 200 OK | NOT RUN | |
| 13 | Desk timer starts normally after answer | NOT RUN | |
| 14 | Two-way audio starts immediately | NOT RUN | |
| 15 | Grandstream RTP → RTPengine → Asterisk → carrier | NOT RUN | |
| 16 | Carrier RTP → Asterisk → RTPengine → Grandstream | NOT RUN | |
| 17 | No ~10 s post-answer delay | NOT RUN | |
| 18 | No ~32 s disconnect | NOT RUN | |
| 19 | Record-Route present on the INVITE reaching Asterisk | NOT RUN | |
| 20 | Two Record-Route headers are actually correct | NOT RUN | expect public hop + container hop |
| 21 | In-dialog BYE routes in both directions | NOT RUN | |
| 22 | Asterisk → Telnyx signalling exits from source port 5060, not 5070 | NOT RUN | |
| 23 | X-VSP-Egress cannot be exploited from the public 5060 socket | NOT RUN | deploy gate D11 |
| 24 | Asterisk SIP/RTP ports inaccessible externally | NOT RUN | deploy gate D10 |

## 4. Ten-minute hold

| Claim | Result | Evidence |
|---|---|---|
| call_sec ≥ 600 | NOT RUN | |
| Normal BYE (desk-initiated) | NOT RUN | |
| Normal 200 OK to BYE | NOT RUN | |
| No provider-initiated teardown | NOT RUN | |
| No ACK timeout | NOT RUN | |
| No RTP timeout | NOT RUN | |
| No session timer failure (no 422/408 on refresh) | NOT RUN | |

## 5. Collected artefacts

| Ref | Artefact | Path |
|---|---|---|
| A/B/C | All SIP on desk, internal and carrier legs | `sip.pcap` |
| D | RTP on both sides (96-byte snaplen) | `rtp.pcap` |
| E | Kamailio log | `vsp-kamailio.log` |
| F | Asterisk full SIP/PJSIP log | `vsp-asterisk.log` |
| G | RTPengine log | `vsp-rtpengine.log` |
| — | Analyzer output | `summary.txt` |
| — | Asterisk channels / endpoints / CDR | `asterisk-*.txt`, `asterisk-cdr.csv` |
| H | Telnyx CDR | attach export for the carrier Call-ID |

## 6. If the call fails

Record the **first** `[FAIL]` line from `summary.txt` — the analyzer is ordered by protocol
sequence, so the topmost failure is the first divergence. Compare that message against the
known-good Asterisk/Telnyx ladder in
[RC1-freepbx-reference-comparison.md](./RC1-freepbx-reference-comparison.md) and
[PROTOCOL-AUDIT-2026-07-30.md](./PROTOCOL-AUDIT-2026-07-30.md) before changing anything.

Do **not** reintroduce the retired Kamailio ACK / CSeq / Contact / Route surgery. If the
carrier ACK is late or missing, the fault is in the Asterisk trunk configuration or in the
edge routing of one message, not in a missing header rewrite.

## 7. Rollback

Preserved and unchanged: `git revert` of the A-prime commit restores the previous
configuration, and section 6 of
[ADR-045-DEPLOY-AND-VALIDATE.md](./ADR-045-DEPLOY-AND-VALIDATE.md) has the
file-level rollback that leaves the Asterisk container stopped but installed.
