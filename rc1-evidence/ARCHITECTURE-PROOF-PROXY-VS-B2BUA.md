# Codebase Proof: Proxy vs B2BUA — VSP Phone v4

**Date:** 2026-08-06  
**Scope:** Source-level proof (no packet capture used as evidence in this document)  
**Files examined:** `infrastructure/kamailio/kamailio.cfg`, `apps/api/src/modules/telecom/**`, `apps/admin/src/lib/softphone/**`, `docs/ADR/**`, `package.json`

> **Resolved 2026-08-06 — Option A′ selected and implemented.**
> The findings below describe the architecture *before* the change. Option A′ (Kamailio
> edge proxy + Asterisk B2BUA core) is now in the tree: see
> [ADR-045](../docs/ADR/ADR-045-asterisk-b2bua-carrier-core.md) for the decision and
> [ADR-045-DEPLOY-AND-VALIDATE.md](./ADR-045-DEPLOY-AND-VALIDATE.md) for the deployment
> and the validation gates that must pass before it is called proven.

---

## 0. Verdict

| Question | Answer from source |
|----------|--------------------|
| Which code owns SIP dialogs? | **`infrastructure/kamailio/kamailio.cfg` only.** No other process terminates SIP. |
| Do we intentionally create separate dialogs per leg? | **Only in one branch** (`BRIDGE_CARRIER`), added 2026-07-30. All other call paths reuse one dialog. |
| Are separate Call-IDs ever created? | **Yes — exactly one place:** `$var(carrier_ci) = $ci + ".b2b"` (derived, not independent). |
| Proxy or true B2BUA? | **Stateful proxy + a hand-rolled partial B2BUA on one branch.** Kamailio's real B2BUA modules are **not loaded**. |
| Architecture of record (ADR) | **Proxy.** ADR-008 lists “SIP Proxy / Routing / Registrar”; **B2BUA appears nowhere** as a responsibility. |

---

## 1. Which source files create and own SIP dialogs

### 1.1 Inventory of SIP-capable code

| Component | SIP role | Evidence |
|-----------|----------|----------|
| `infrastructure/kamailio/kamailio.cfg` | **Only server-side SIP entity.** Transactions (`t_newtran`), dialogs (`dlg_manage`), local UAC (`uac_req_send`) | Lines 895, 1074, 1122 |
| `apps/api` (NestJS) | **No SIP stack.** HTTP policy service only | No SIP transport dependency; consumes `dto.callId` supplied by Kamailio |
| `apps/admin` browser softphone | `sip.js` **client UA in the browser** — a separate endpoint, not platform dialog owner | `apps/admin/src/lib/softphone/sip-softphone.ts` (`new UserAgent`, `Inviter`, `Registerer`) |
| `vsp-rtpengine` | **Media only**, no SIP dialog | rtpengine NG control |

**`package.json` contains `sip.js` — browser softphone only.** The API imports no SIP library:

```
apps/api/src/modules/telecom/routing/routing.service.ts
imports: @nestjs/common, @nestjs/config, node:crypto, prisma, redis, …   ← no SIP
```

### 1.2 The API cannot own a dialog (proof by interface)

`routing.service.ts` returns a **routing plan**, not SIP state:

```640:653:apps/api/src/modules/telecom/routing/routing.service.ts
    const plan: RouteResponseDto = {
      platformUuid,
      tenantId,
      callSessionId,
      fromLineId: callerCtx.lineId,
      callIntent: 'OUTBOUND',
      actions: [
        {
          type: 'BRIDGE_CARRIER',
          target: bridgeTarget,
          priority: 0,
          lineId: callerCtx.lineId,
        },
      ],
```

`BRIDGE_CARRIER` is a **destination string**. The API never emits Call-ID, From-tag, To-tag, CSeq, Contact, or Route. It **records** `sipCallId: dto.callId` — a value Kamailio gives it.

**ADR-004 §4 confirms this by design:** Platform UUID is deliberately independent of SIP Call-ID; “Multiple SIP Call-IDs may map to one Platform UUID.” The application layer is a *correlator*, not a dialog owner.

---

## 2. Are separate dialogs intentionally generated per leg?

### 2.1 Call path census (`kamailio.cfg`)

| # | Path | Dialog behavior | Code |
|---|------|-----------------|------|
| 1 | Desk → PSTN (`BRIDGE_CARRIER`) | **Two Call-IDs** (desk parked, carrier local UAC) | 1074–1126 |
| 2 | PSTN → desk (inbound) | **Single dialog, proxied** | 891–898 (no `t_newtran` when `from_carrier==1`), 1185 `route(RELAY)` |
| 3 | Desk → desk / ring group (`FORK`) | **Single dialog, proxied + forked branches** | 1155–1170 `append_branch`, `lookup("location")`, 1185 |
| 4 | IVR / voicemail (`APP_MEDIA`) | **Single dialog, proxied** | 613–635 `APP_MEDIA_RELAY` → `RELAY` |
| 5 | REFER / transfer | **Proxied** | 571 `t_relay()` |

**Four of five call paths are pure proxy.** Only path 1 attempts B2BUA.

### 2.2 The only separate Call-ID in the codebase

```1084:1086:infrastructure/kamailio/kamailio.cfg
        $var(carrier_ci) = $ci + ".b2b";
        $sht(carrier_ci_by_desk=>$ci) = $var(carrier_ci);
        $sht(desk_ci_by_carrier=>$var(carrier_ci)) = $ci;
```

Observations:

1. The carrier Call-ID is **derived by string concatenation** from the desk Call-ID. A true B2BUA generates an **independent** identifier (Asterisk/FreeSWITCH use random UUID-class values).
2. Leg correlation is stored in **`htable`** (`carrier_ci_by_desk` / `desk_ci_by_carrier`), not in the dialog engine.
3. `autoexpire=7200` and memory-only (`modparam("dialog","db_mode",0)`): **a Kamailio restart destroys all leg correlation**, orphaning in-progress calls.

### 2.3 Only the desk leg is a tracked dialog

```1074:1082:infrastructure/kamailio/kamailio.cfg
        dlg_manage();
        # t_suspend MUST run while only 100 Trying has been sent (before final reply).
        # Do not send 180 then t_continue for ringback — that consumes the park before carrier 200.
        if (!t_suspend()) {
            xlog("L_ERR", "B2BUA t_suspend failed callid=$ci\n");
            t_reply("500", "Server Internal Error");
            exit;
        }
        $sht(b2b_mode=>$ci) = "1";
        $sht(b2b_tindex=>$ci) = $T(id_index);
```

`dlg_manage()` runs **once, on the desk INVITE**. The carrier leg created by `uac_req_send()` is **never registered with the dialog module** — it has no dialog state, no timers, no re-INVITE handling, no session-timer support.

---

## 3. Is Kamailio acting as a proxy, or do we implement a true B2BUA?

### 3.1 Kamailio's real B2BUA modules are not loaded

Module list (`kamailio.cfg` lines 104–175) contains: `tm, tmx, sl, rr, pv, sdpops, maxfwd, textops, textopsx, siputils, xlog, sanity, ctl, cfg_rpc, counters, htable, tls, xhttp, websocket, usrloc, registrar, auth, http_client, jansson, permissions, dispatcher, dialog, nathelper, pike, path, rtpengine, uac`.

**Absent:** `b2b_entities.so`, `b2b_logic.so`, `b2b_sca.so` — i.e. every module Kamailio ships **for** B2BUA behavior.

### 3.2 We built a B2BUA out of a module documented for standalone requests

Kamailio UAC module documentation, `uac_req_send()`:

> “This function sends a SIP message from the configuration file. The message is built out of `$uac_req(...)` pseudo-variable.”

It is a **one-shot request sender**. Documented consequences we inherit:

| Doc statement | Impact on our carrier leg |
|---------------|---------------------------|
| `event_route[uac:reply]` `evroute=1` → “executed for the **final reply**… if challenged 401/407, executed twice” | **Provisional 180/183 from Telnyx are never delivered to the desk phone.** No ringback path exists in code. |
| “CSeq is not increased automatically by `uac_auth()`… dialog module has to be used, with CSeq tracking” | Auth/CSeq correctness depends on compensating config, not the UAC itself |
| No dialog state | BYE/CANCEL must be **hand-rebuilt** from htable |

### 3.3 Hand-rebuilt in-dialog requests (what a B2BUA would do for us)

```1731:1755:infrastructure/kamailio/kamailio.cfg
    $uac_req(all) = $null;
    $uac_req(method) = "BYE";
    $uac_req(ruri) = $var(ct);
    $uac_req(furi) = $var(from_b);
    $uac_req(turi) = $var(to_b);
    $uac_req(ouri) = TELNYX_SBC_DU;
    $uac_req(callid) = $var(cci);
    $uac_req(sock) = KAM_SIP_OUT_SOCK;
    $var(routes) = $sht(carrier_route_set=>$ci);
```

The BYE's dialog identity (From-tag, To-tag, CSeq continuity, route set) is **reconstructed from hash-table strings**. There is no dialog object guaranteeing correctness. The same pattern repeats for CANCEL (1700–1712) and carrier→desk BYE (1777–1786).

### 3.4 Legacy proxy machinery still present and reachable

Simultaneously alive in the same config:

| Route | Purpose | Line |
|-------|---------|------|
| `CARRIER_RELAY_ACK` | relay **desk** ACK to Telnyx (proxy model) | 1574 |
| `CARRIER_SANITIZE_ACK_DU` | patch ACK next hop | 452, 482 |
| `CARRIER_APPLY_SIG` / `CARRIER_APPLY_ACK_ROUTE` | rewrite in-dialog target | 1378, 505 |
| `DESK_NORMALIZE_CARRIER_REPLY` | rewrite carrier replies into desk identity (`remove_hf("Record-Route")`, From/CSeq/Contact surgery) | 1330–1375 |
| `failure_route` `uac_auth()` + `t_relay()` | proxy-model trunk auth | 1957–1965 |

Selection between “B2BUA path” and “proxy path” is decided at runtime by `$sht(b2b_mode=>$ci)`. **Two architectures coexist in one config, arbitrated by a hash-table flag.**

### 3.5 Classification

> **Kamailio is a stateful SIP proxy for 4 of 5 call paths, and a partially implemented, htable-backed B2BUA on the outbound-PSTN path. It is not a true B2BUA, because no leg is a managed dialog on the carrier side, provisional responses are not bridged, and Kamailio's B2BUA modules are unused.**

### 3.6 The design of record says “proxy”

`docs/ADR/ADR-008-kamailio-architecture.md`:

- Responsibility list: “SIP Registrar, SIP Proxy, SIP Routing, Authentication, Registration, NAT Traversal Coordination, Load Balancing, Failover, TLS Termination, SIP Security” — **B2BUA is not listed**
- “Stateful dialog handling is **minimized** to what SIP requires”

The B2BUA work of 2026-07-30 has **no ADR**. The implementation drifted from the approved architecture without a decision record.

---

## 4. Comparison with Asterisk and FreeSWITCH

| Property | **Asterisk (chan_pjsip)** | **FreeSWITCH (mod_sofia)** | **Kamailio proxy (default)** | **VSP v4 today** |
|----------|---------------------------|----------------------------|------------------------------|------------------|
| Core abstraction | **Channel** per leg | **Session (UUID)** per leg | **Transaction / message** | Transaction + htable strings |
| Legs per call | 2 independent channels bridged | a-leg / b-leg bridged | 1 dialog forwarded | 1 dialog (4 paths) / 2 partial (1 path) |
| Call-ID per leg | Independent | Independent | Same | Derived `desk + ".b2b"` |
| From-tag / To-tag | Per leg, engine-owned | Per leg, engine-owned | Passthrough | Partly generated, partly copied from htable |
| CSeq space | Independent per leg | Independent per leg | Passthrough | Manual |
| ACK for 2xx on trunk | Generated by Asterisk immediately | Generated by FreeSWITCH immediately | **Relayed from the phone** | TM local ACK on 1 path; relayed on others |
| Provisional (180/183) bridging | Automatic | Automatic | Automatic (it is a proxy) | **Missing on the B2BUA path** |
| re-INVITE / UPDATE / hold | Engine-handled | Engine-handled | Passthrough | **Not implemented on carrier leg** |
| Session timers (RFC 4028) | Supported | Supported | Via `sst` module | **Not implemented** |
| Topology hiding | Inherent | Inherent | Requires B2BUA modules | Partial via header rewrites |
| Restart behavior | Channels in memory (calls drop, state consistent) | Sessions in memory / sofia recovery | Stateless-ish | **htable loss orphans legs** |

**Key structural difference:** Asterisk and FreeSWITCH own a *call object* that owns two *dialog objects*. Our implementation owns a *transaction* plus *strings in a hash table*. Every mid-dialog behavior Asterisk gets free must be hand-coded here — and each hand-coded piece is a new failure mode.

---

## 5. Can the current architecture ever satisfy Telnyx without becoming a B2BUA?

**Strictly on protocol: yes — but only under conditions we do not currently meet.**

Telnyx does not require a B2BUA. It requires a coherent dialog: an ACK for its 2xx delivered to the right next hop within Timer H (~32s), with a Route set that reverses its Record-Route.

A **pure proxy** can satisfy that **if and only if** all of these hold:

| Condition | Current state |
|-----------|---------------|
| C1. Do **not** rewrite From/CSeq/Contact between legs | **Violated** — `DESK_NORMALIZE_CARRIER_REPLY` rewrites all three |
| C2. Do **not** strip `Record-Route` from carrier responses | **Violated** — `remove_hf("Record-Route")` at line 1331 |
| C3. Desk phone must produce a correct, prompt ACK (it owns the dialog) | **Not controllable** — Grandstream behind NAT; ACK timing is a third-party dependency |
| C4. Trunk auth must not desynchronize CSeq between legs | **Violated by design** — Telnyx credential connection challenges every INVITE; `uac_auth()` bumps CSeq on the carrier leg only |
| C5. Product features must not require leg independence | **Violated** — recording, attended transfer, queue/IVR handoff, CLI control, topology hiding all assume B2BUA |

C4 is removable **only** by switching the Telnyx SIP Connection to **IP authentication** (Telnyx supports IP / IP+Token / IP+Tech-Prefix for static IPs; EC2 egress `32.196.41.160` is static). That removes the 407 and the CSeq skew entirely.

C3 is **not removable in a proxy**: in proxy mode the carrier ACK is, by definition, the phone's ACK. Telnyx's 32-second timer therefore remains hostage to Grandstream + NAT behavior forever.

**Conclusion:**

> A pure proxy **can** be made to work with Telnyx (proxy + IP auth + no header surgery + preserved Record-Route) — that is a standard Kamailio deployment. It **cannot** deliver PBX features, and it permanently couples carrier-side ACK reliability to a NAT'd desk phone. For a product that already promises recording, transfer, queues, IVR, and CLI control, **B2BUA is required** — not because Telnyx demands it, but because the product does.

---

## 6. Migration plan — minimum architectural change

> **CORRECTION (2026-08-06):** An earlier revision of this section recommended adopting Kamailio's
> `b2b_logic` module. **That module does not exist in Kamailio.** See §6.0. The options below
> replace that recommendation.

### 6.0 Blocking finding: Kamailio has no B2BUA engine

| Check | Result |
|-------|--------|
| Official [Kamailio 5.8 module index](https://www.kamailio.org/docs/modules/5.8.x/) | Alphabetical list goes `AVPOPS → BENCHMARK`. **No `B2B_ENTITIES`, `B2B_LOGIC`, or `B2B_SCA`.** |
| Deployed image `kamailio 5.8.7` | `ls modules/ \| grep -i b2b` → **no matches** (237 modules present) |
| `b2b_logic` documentation found by search | Belongs to **OpenSIPS**, not Kamailio |

Kamailio is a **SIP proxy/router by design**. It offers `topoh` / `topos` for topology *hiding*,
but those remain proxy behavior: the **endpoint still owns the ACK**. There is no supported way to
express a true B2BUA in Kamailio configuration.

Therefore “migrate to a Kamailio B2BUA module” is **not an available option**. A real B2BUA requires
either a different SIP router (OpenSIPS) or a dedicated B2BUA element (Asterisk / FreeSWITCH).

### Option A′ (recommended, strategic): Kamailio edge + Asterisk/FreeSWITCH B2BUA core

Industry-standard layering, and identical to the reference implementation already used for
comparison in `rc1-evidence/asterisk-telnyx-baseline.sh`.

```
Grandstream ─SIP─ Kamailio (edge)  ─SIP─  Asterisk/FreeSWITCH (B2BUA)  ─SIP─ Telnyx
                  registrar, digest auth,        channels/dialogs, trunk auth,
                  NAT, TLS/WSS, dispatcher,      ringback, ACK ≈1 ms, session
                  tenant routing lookups         timers, transfer, recording
```

| Concern | Owner after A′ |
|---------|----------------|
| Desk registration / digest | Kamailio (unchanged) |
| Tenant routing policy (NestJS) | Unchanged — Asterisk consumes the same plan |
| Carrier dialog + ACK | **Asterisk/FreeSWITCH** (native, ~1 ms) |
| Telnyx 407 credential auth | **Native** (`outbound_auth` in PJSIP) |
| Ringback / provisional | **Native** |
| RFC 4028 session timers | **Native** |
| Recording / transfer / queue / IVR | **Native** |
| Media | Asterisk RTP or keep RTPengine for the desk leg |

**Deletions in Kamailio:** the entire hand-rolled carrier state machine (`B2B_*`, `CARRIER_*`,
`DESK_NORMALIZE_CARRIER_REPLY`, `carrier_*`/`b2b_*` htables) — roughly 560 lines.

**Cost:** new service in the compose stack; dialplan/ARI integration; media path decision;
one ADR. This is the only option that satisfies the product feature set.

### Option B′ (fastest unblock, keeps current stack): clean RFC-3261 proxy + Telnyx IP auth

**B1** Switch the Telnyx SIP Connection to **IP authentication** (static egress `32.196.41.160`).
Removes the 407 entirely, and with it the CSeq skew between legs.  
**B2** Delete the `uac_req_send` carrier leg and every B2BUA-style rewrite
(`DESK_NORMALIZE_CARRIER_REPLY`, Contact/From/CSeq surgery).  
**B3** `record_route()` the desk INVITE and **stop** `remove_hf("Record-Route")` on carrier
responses, so the phone finally receives a valid route set and a reachable remote target.  
**B4** Single in-dialog path via `loose_route()`.  
**B5** Optional later: `topos` for topology hiding.

**What this fixes:** the desk phone has never been given a correct dialog to ACK into
(unreachable Contact + stripped Record-Route). B′ removes that defect at the root.  
**What it cannot fix:** carrier ACK timing remains the endpoint's responsibility; no
carrier-leg PBX features.

### Option C′ (not recommended): finish the hand-rolled B2BUA

Blocked by design: `uac_req_send` + `evroute=1` delivers **only final replies**, so Telnyx's
180/183 can never be bridged to the desk phone — there is no config-level way to produce
ringback. Every mid-dialog feature stays bespoke and untested.

### Decision gate

| Criterion | A′ (Asterisk/FS core) | B′ (clean proxy + IP auth) | C′ (hand-rolled) |
|-----------|----------------------|----------------------------|------------------|
| Platform owns carrier ACK | **Yes** | No | Partially |
| Ringback to desk | **Yes** | Yes (proxied) | **No** |
| Works with Telnyx credential auth | **Yes** | Requires IP auth | Fragile |
| Session timers / re-INVITE / hold | **Yes** | Passthrough | No |
| Recording / transfer / queues on carrier legs | **Yes** | No | No |
| Custom SIP state code | **~560 lines deleted** | ~560 deleted | Grows |
| Time to first validated call | Days | Hours | Unknown |
| Requires ADR | Yes (new component) | Yes (ratify proxy) | Yes |

### Sequencing (no incremental header fixes)

1. Choose A′ or B′ and write the ADR (**ADR-045**).  
2. Implement on a branch behind a flag.  
3. Validate against gates: separate Call-IDs (A′), ACK &lt;50 ms (A′) / correct route set (B′),
   audible ringback, ≥600 s hold, manual BYE, Telnyx CDR `call_sec >= 600`.  
4. Only then delete legacy routes and remove the flag.

---

## 7. Evidence index

| Claim | File / lines |
|-------|--------------|
| Desk-only transaction creation | `kamailio.cfg` 891–898 |
| Dialog created for desk leg only | `kamailio.cfg` 1074 |
| Carrier leg = local UAC, not dialog | `kamailio.cfg` 1095–1126 |
| Derived carrier Call-ID | `kamailio.cfg` 1084 |
| htable leg correlation | `kamailio.cfg` 219–231 |
| Hand-built BYE / CANCEL | `kamailio.cfg` 1700–1712, 1731–1755, 1777–1786 |
| Record-Route stripped toward desk | `kamailio.cfg` 1331 |
| Legacy proxy ACK paths alive | `kamailio.cfg` 452, 482, 1378, 1574 |
| Proxy relay for other call types | `kamailio.cfg` 388, 453, 472, 517, 635, 1185 |
| No B2BUA modules loaded | `kamailio.cfg` 104–175 |
| API has no SIP stack | `apps/api/src/modules/telecom/routing/routing.service.ts` imports |
| API returns policy, not dialogs | same file, 640–653 |
| `sip.js` is browser-only | `apps/admin/src/lib/softphone/sip-softphone.ts` |
| ADR says proxy, not B2BUA | `docs/ADR/ADR-008-kamailio-architecture.md` (responsibility list; §“stateful handling minimized”) |
| Platform UUID ≠ Call-ID by design | `docs/ADR/ADR-004-call-architecture.md` §4 |
