# ADR-045 — Asterisk B2BUA carrier core behind the Kamailio edge

- **Status:** Accepted
- **Date:** 2026-08-06
- **Supersedes (partially):** ADR-008 (Kamailio architecture) for the PSTN carrier leg only
- **Evidence:** `rc1-evidence/PROTOCOL-AUDIT-2026-07-30.md`, `rc1-evidence/ARCHITECTURE-PROOF-PROXY-VS-B2BUA.md`

## Context

Grandstream → PSTN calls exhibit two reproducible defects:

1. ~10 s from remote answer to desk-phone timer start and two-way audio.
2. Telnyx sends `BYE` ~32 s after answer (Telnyx ACK Timeout, RFC 3261 Timer H on the
   carrier's UAS side).

The protocol audit established the mechanism. Kamailio proxies the desk INVITE to Telnyx
with `t_relay()`. In a proxy, the ACK for a 2xx is a **new end-to-end transaction owned by
the calling UAC** (RFC 3261 §13.2.2.4, §17.1.1.3) — the proxy must not generate it. So
Telnyx's `200 OK` is only ACKed once the Grandstream's ACK traverses NAT, Kamailio's
Contact/Route rewriting, and the carrier socket. Every retransmission of Telnyx's `200 OK`
(T1 backoff: 0.5, 1, 2, 4, 8, 16 s) adds latency, and if our relayed ACK never matches the
dialog Telnyx built, Timer H fires at 64×T1 ≈ 32 s and Telnyx tears the call down.

Roughly 560 lines of `kamailio.cfg` had accumulated attempting to make a proxy behave like
a UAC: Contact caching, Record-Route reversal, CSeq rewriting, `$du` sanitisation, and a
hand-rolled `t_suspend()` / `uac_req_send()` pseudo-B2BUA. None of it can change the fact
that the proxy does not own the carrier dialog, so none of it can make the ACK independent
of the desk phone.

Kamailio has no `b2b_logic` / `b2b_entities` module (those are OpenSIPS; Kamailio's
equivalents were removed and are not present in 5.8). There is therefore no in-Kamailio
B2BUA available to us.

## Decision

Introduce **Asterisk as a B2BUA carrier core behind Kamailio**, and return Kamailio to a
plain RFC 3261 edge proxy.

```
Grandstream ──INVITE──> Kamailio (edge proxy, record-route)
                            │
                            └──INVITE──> Asterisk  ── B2BUA dialog boundary ──
                                            │
                                            └──INVITE (new Call-ID)──> Kamailio ──> Telnyx
```

- **Desk leg** (`phone ↔ Kamailio ↔ Asterisk`): Kamailio proxies statefully and
  record-routes. Asterisk is the UAS; it answers the phone.
- **Carrier leg** (`Asterisk ↔ Kamailio ↔ Telnyx`): Asterisk is the UAC with its **own
  Call-ID, own From-tag, own Contact, own CSeq space**. Asterisk ACKs Telnyx's `200 OK`
  from its own transaction layer within milliseconds, with no dependency on the desk phone.
- Asterisk reaches Telnyx through `outbound_proxy=sip:kamailio:5060;lr`, so Kamailio
  remains the only element that talks to the carrier. Kamailio record-routes the carrier
  leg, so Telnyx's in-dialog requests return via Kamailio's public address and Asterisk's
  private Contact is only ever resolved inside `vsp_internal`. No Contact rewriting.
- Asterisk owns trunk digest auth (`outbound_auth`), session timers (RFC 4028), and
  early-media/ringback bridging natively.
- Media stays anchored in RTPengine on both legs (RTP path:
  `phone ↔ rtpengine ↔ Asterisk ↔ rtpengine ↔ Telnyx`). Asterisk publishes no host ports
  and needs no security-group change.

Scope of this ADR is the **outbound PSTN path** (`BRIDGE_CARRIER`). Inbound DID delivery
continues to terminate on Kamailio unchanged; moving it behind Asterisk is a follow-up.

## Consequences

**Positive**

- ACK to Telnyx becomes a local, sub-50 ms UAC action. Telnyx Timer H can no longer fire,
  which removes the 32 s teardown by construction rather than by header tuning.
- Answer latency collapses to one RTT: Asterisk relays the carrier `200 OK` to the phone as
  its own `200 OK` immediately instead of after `200 OK` retransmissions.
- Ringback, session timers, digest auth, and re-INVITE handling become stock, tested
  Asterisk behaviour instead of bespoke script logic.
- ~560 lines of dialog-emulation script are deleted; Kamailio's role matches ADR-008 again.

**Negative / accepted costs**

- A new stateful service (`vsp-asterisk`) joins the stack: another container to build,
  monitor, and upgrade.
- Two additional RTP hops on the same host. Acceptable at current concurrency.
- Call state for PSTN calls now lives in Asterisk, so Asterisk restarts drop active PSTN
  calls. Registrations remain in Kamailio and are unaffected.
- Two SIP dialects to reason about during debugging (Kamailio script + Asterisk dialplan).

## Alternatives considered

- **Kamailio `b2b_logic`** — rejected: module does not exist in Kamailio.
- **Clean RFC 3261 proxy + Telnyx IP authentication ("B-prime")** — a correct proxy removes
  the auth-driven CSeq/dialog divergence but *cannot* remove the ACK dependency on the desk
  phone, because a proxy is forbidden from generating the 2xx ACK. It reduces the failure
  probability without eliminating the mechanism. Rejected as insufficient.
- **More header remediation** — rejected; two months of evidence show the defect is
  architectural, not header-level.

## Validation gates

This ADR is only "proven" when all of the following hold on the Grandstream → PSTN path:

1. Ringback audible before answer (Asterisk relays 180/183 to the phone).
2. `ACK` to Telnyx observed within 50 ms of Telnyx's `200 OK` in a packet capture.
3. Desk-phone timer starts at answer (no ~10 s gap).
4. Held call survives > 600 s with no `BYE` from Telnyx.
5. Manual hang-up produces a clean `BYE` on both legs.
6. Telnyx CDR shows the matching duration.
