# RC1 — True B2BUA Carrier Leg (Asterisk-Identical)

**Status:** IMPLEMENTED in `infrastructure/kamailio/kamailio.cfg`  

**2026-07-30 fix:** Desk “Internal Server Error” was TM fallback 500 after `uac_req_send` 407 —
`$uac_req(auser/apasswd)` required for auto-auth (not `uac_auth`+`t_relay`); fail codes must
be int via htable across `t_continue` (`get_int_fparam` on string → 500).  
**Date:** 2026-07-30  
**Directive:** No further proxy ACK header patches — ACK ownership is architectural.

---

## Exact protocol divergence

| Dimension | Asterisk PJSIP (works) | Kamailio hybrid (failed) | Kamailio B2BUA (target) |
|-----------|------------------------|--------------------------|-------------------------|
| Role toward Telnyx | UAC / B2BUA | Stateful proxy (`t_relay`) | UAC via `uac_req_send` |
| Call-ID | Separate per leg | Same Call-ID | Separate (`desk` vs `desk.b2b`) |
| Contact on carrier INVITE | Asterisk itself | Phone / hybrid | PBX public IP |
| Post-200 ACK | ~1 ms, local UAC | Waits for Grandstream | TM `local_ack_mode=0` auto-ACK |
| Desk ACK | Confirms desk dialog only | Relayed/rewritten to Telnyx | Absorbed |

**First architectural divergence:** on carrier `200 OK`, Asterisk emits a compliant UAC ACK immediately. Kamailio `tm` only auto-ACKs **`t_uac*`** transactions — not `t_relay()`. Every Route/CSeq/`$du` patch left this ownership model unchanged.

---

## Design

```
Grandstream --INVITE Call-ID=A--> Kamailio UAS (t_suspend)
                                      |
                                      +--uac_req_send INVITE Call-ID=A.b2b--> Telnyx
                                      |         Contact=PBX, CLI From
                                      |<--407-- uac_auth + t_relay retry
                                      |<--200-- TM local ACK (~1ms)
                                      |
                                 t_continue → t_reply 200 to desk (PBX Contact, desk SDP answer)
Grandstream --ACK Call-ID=A--> absorb (never sent to Telnyx)
```

### Correlation htables

| Key | Purpose |
|-----|---------|
| `b2b_mode` / desk CI | Flag dual-dialog call |
| `b2b_tindex` / `b2b_tlabel` | Parked desk INVITE for `t_continue` |
| `carrier_ci_by_desk` / `desk_ci_by_carrier` | BYE/CANCEL bridge |
| `b2b_sdp` | rtpengine-answered SDP for desk 200 |
| `carrier_uac_ack_done` | Desk ACK absorb gate |

### RTP

`rtpengine_offer` on desk Call-ID; `rtpengine_answer` on carrier 200 with `call-id=<desk_ci>` so both SIP dialogs share one media session.

---

## Validation

```bash
# Asterisk GS desk reference (ACK ~1ms)
GS_ASTERISK_DESK=1 AST_HOLD=90 DEST=+17045502033 PHONE_IP=122.177.246.92 \
  bash rc1-evidence/pbx-interop-test.sh

# Kamailio ≥10 min hold
SEC=900 bash rc1-evidence/validate-b2bua-carrier.sh
```

**PASS:** carrier ACK within 50ms of 200; no `ACK Timeout`; `call_sec>=600`; normal BYE; rtpengine both legs >0.

---

## Retired paths

- `CARRIER_RELAY_ACK` no longer sends to Telnyx when `b2b_mode=1` (absorb only).
- Proxy Record-Route on carrier INVITE removed (UAC does not RR itself).
