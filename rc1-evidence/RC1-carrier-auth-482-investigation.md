# RC1 Investigation: Outbound Carrier Auth — `482 Request Merged`

**Status: Exit Criterion B met.** Root cause of the `482` is identified with packet-level evidence. A separate, unresolved primary failure (Telnyx `403 Forbidden` on the authenticated retry) is also identified but requires Telnyx-side (Mission Control / Call Control) log correlation to explain — the wire evidence alone does not show a malformed field. **No code changes have been made.**

## Evidence artifacts (preserved)

- `telnyx-carrier-retest.pcap` — raw capture, filter `host 192.76.120.10` (Telnyx), 61,685 bytes
- `telnyx-carrier-retest.txt` — full ASCII/timestamped extraction (`tcpdump -tttt -A -nn`)
- `kam-retest-live.txt`, `api-retest-live.txt` — Kamailio/API application logs for the same window

Two full call attempts were captured, ~26 seconds apart, both from the same Zoiper session, both exhibiting **the identical pattern**:

| # | Call-ID | From-tag |
|---|---|---|
| 1 | `hVkh3e0Ks1OmDLEiq78g4Q..` | `38a6ae1f` |
| 2 | `fopLif-X-bwRAiGEwdrkUg..` | `d5b96267` |

All analysis below uses Call 1; Call 2 is byte-for-byte structurally identical and confirms the finding is not a one-off.

## Sequence of messages (Call 1)

| Time (UTC) | Direction | Message | Transport/Branch |
|---|---|---|---|
| 14:51:46.344 | Kamailio → Telnyx | `INVITE` CSeq **1**, no `Proxy-Authorization` | TCP, branch `...480a...0.0` |
| 14:51:46.536 | Telnyx → Kamailio | `407 Proxy Authentication Required` | same transaction |
| 14:51:46.537 | Kamailio → Telnyx | `ACK` CSeq 1, then **authenticated retry** `INVITE` CSeq **2** | TCP, branch `...480a...0.1.cs1` |
| 14:51:46.694 | Telnyx → Kamailio | **`403 Forbidden`** (not another 407) | same transaction |
| 14:51:46.695 | Kamailio → Telnyx | `ACK` CSeq 2 | — |
| 14:51:47.152 | **Zoiper's client → Kamailio → Telnyx** | **New, independent** `INVITE` — same Call-ID (`hVkh3e0Ks1OmDLEiq78g4Q..`), same From-tag (`38a6ae1f`), CSeq **2** again, `Proxy-Authorization` addressed to **our own domain** (`username="100"`, `uri="sip:13174492106@sip.vspphone.com;transport=UDP"`) | UDP, **fresh branch** `...ecdd...0` (no `.cs1` suffix — a *new initial transaction*, not a retry of the prior one) |
| 14:51:47.194 | Telnyx → Kamailio | `100 Trying` | |
| 14:51:47.308 | Telnyx → Kamailio | **`482 Request merged`** | |

## Answers to the investigation questions

### 1. Did Telnyx return the 482, or did Kamailio generate it?

**Telnyx generated it.** The `482 Request merged` packet at 14:51:47.308 originates from `192.76.120.10` (Telnyx) to `172.31.39.116` (our server) — confirmed at the IP layer, not synthesized locally by Kamailio's `sl`/`tm` module (those would show source IP `172.31.39.116`/`32.196.41.160`).

### 2. Comparison — Original INVITE vs. Authenticated Retry (the *same*-transaction retry, CSeq 1→2, both to Telnyx)

| Field | Original INVITE (CSeq 1) | Authenticated Retry (CSeq 2) | Match? |
|---|---|---|---|
| Request-Line | `INVITE sip:+13174492106@sip.telnyx.com SIP/2.0` | `INVITE sip:+13174492106@sip.telnyx.com SIP/2.0` | ✅ identical |
| Call-ID | `hVkh3e0Ks1OmDLEiq78g4Q..` | `hVkh3e0Ks1OmDLEiq78g4Q..` | ✅ identical |
| From | `<sip:100@sip.vspphone.com>;tag=38a6ae1f` | `<sip:100@sip.vspphone.com>;tag=38a6ae1f` | ✅ identical (expected — retry, same dialog attempt) |
| To | `<sip:13174492106@sip.vspphone.com>` | `<sip:13174492106@sip.vspphone.com>` | ✅ identical |
| CSeq | `1 INVITE` | `2 INVITE` | ✅ **incremented correctly** |
| Via branch (top) | `z9hG4bK1ddd.480a...0.**0**` | `z9hG4bK1ddd.480a...0.**1.cs1**` | ✅ new branch, same base transaction — correct |
| Contact | `<sip:100@122.177.247.143:7921;transport=UDP>` | `<sip:100@122.177.247.143:7921;transport=UDP>` | ✅ identical |
| Route / Record-Route | *(none present)* | *(none present)* | n/a |
| Request-URI | `sip:+13174492106@sip.telnyx.com` | `sip:+13174492106@sip.telnyx.com` | ✅ identical |
| Content-Length | 341 | 341 | ✅ identical (SDP unchanged) |

**Finding**: the CSeq-increment fix (`dlg_manage()` + `track_cseq_updates`) **worked correctly**. This retry is *not* what triggers the `482` — it gets a `403 Forbidden` instead, a different and separate problem (see §7 below).

### 3. Confirm CSeq incremented on the authenticated retry

**Yes — confirmed: `1` → `2`.** This part of the earlier fix is validated by this capture.

### 4. If CSeq incremented correctly, what transaction identity remained unchanged and caused the merged-request detection?

The `482` is **not** a response to that CSeq-2 retry. It is the response to a **third, later, independent INVITE** (14:51:47.152) sent 457ms after the 403. Comparing that third INVITE to the very first INVITE of the dialog:

| Field | 1st INVITE (14:51:46.344) | 3rd INVITE — the one that got 482 (14:51:47.152) | Same? |
|---|---|---|---|
| Call-ID | `hVkh3e0Ks1OmDLEiq78g4Q..` | `hVkh3e0Ks1OmDLEiq78g4Q..` | **Same** |
| From tag | `38a6ae1f` | `38a6ae1f` | **Same** |
| To tag | *(none — no to-tag on initial request)* | *(none — no to-tag: presented as a fresh initial request)* | **Same (absent)** |
| CSeq | `1` | `2` | different |
| Via branch | `...480a...0.0` | `...ecdd...**0**` (fresh top-level branch, unrelated string) | **different branch, but...** |
| Proxy-Authorization | none | `username="100"`, `uri="sip:13174492106@sip.vspphone.com;transport=UDP"` | different (new field) |
| Transport | TCP | **UDP** | different |

**This is the exact RFC 3261 §8.2.2.2 "merged request" trigger**: a request presented with **no To-tag** (i.e., as an *initial* request) that shares **Call-ID + From-tag** with a transaction Telnyx already fully processed to completion. Because Telnyx cannot match it to the earlier transaction by branch (branch differs, transport differs — TCP vs UDP even), but Call-ID+From-tag collide with dialog state it already has, its proxy layer classifies it as a duplicate/merged fork and rejects with `482` **without evaluating the Proxy-Authorization content at all**.

### 5. Kamailio module/transaction responsible for generating the 482?

**None — 482 is not Kamailio-generated** (see §1). However, **Kamailio's own behavior is what produced the colliding 3rd INVITE**: Kamailio relayed a digest challenge (bearing Telnyx's original nonce `9c0ba02c-07ec-4cac-824f-901d954352cc`) back toward the client side, and when the client's own retry arrived, Kamailio's `route[INVITE]` processed it as a **brand-new initial call** (confirmed independently in the application log: `routing/resolve` was called again, `BRIDGE_CARRIER` re-evaluated again) rather than recognizing it as a continuation of the in-flight dialog — and forwarded it to Telnyx reusing the **same Call-ID and From-tag** the first attempt had already used and Telnyx had already closed out.

### 6. Was Zoiper's `482` a secondary consequence, or the primary failure?

**Confirmed secondary/cascading.** The chain is:
1. Kamailio's own authenticated retry is the *primary* failure point — Telnyx returns `403 Forbidden` to it (§7).
2. Kamailio does not intercept/replace that failure; the transaction's last response propagates back toward the client side.
3. The client (Zoiper) reacts to a digest challenge it received (carrying Telnyx's nonce) by mounting its own automatic retry, addressed to Kamailio's own domain, reusing the same Call-ID/From-tag.
4. Kamailio treats that retry as a new initial call and forwards it to Telnyx, which — because the identity (Call-ID+From-tag) collides with the already-completed first transaction — rejects it with `482 Request Merged`.

**The `482` Zoiper displays is therefore a downstream artifact, not the root cause.**

## 7. The unresolved primary issue: Telnyx `403 Forbidden` on the authenticated retry

The CSeq-2 retry's `Proxy-Authorization` header, checked field-by-field against Telnyx's `Proxy-Authenticate` challenge:

| Field | Telnyx `Proxy-Authenticate` (challenge) | Kamailio `Proxy-Authorization` (response) | Match? |
|---|---|---|---|
| realm | `sip.vspphone.com` | `sip.vspphone.com` | ✅ |
| nonce | `9c0ba02c-07ec-4cac-824f-901d954352cc` | `9c0ba02c-07ec-4cac-824f-901d954352cc` | ✅ |
| algorithm | `MD5` | `MD5` | ✅ (not MD5-sess — matches) |
| qop | `auth` | `auth` | ✅ |
| opaque | `870e7cce-a8cb-4773-b0ed-53d0a896af66/10.239.135.24/b3b23be` | `870e7cce-a8cb-4773-b0ed-53d0a896af66/10.239.135.24/b3b23be` | ✅ |
| username | *(not present in challenge)* | `userinfo26316` | matches configured `uac` credential row |
| uri | *(challenge doesn't carry one)* | `sip:+13174492106@sip.telnyx.com` | ✅ **matches Request-URI exactly** |
| nc | — | `00000001` | first use of this nonce — correct |
| cnonce | — | `2497428355` | present, well-formed |
| response | — | `ad5c4c6aeca0ccd40e4f0718455331a5` | cannot be verified without the shared secret |

**No structurally malformed or mismatched field was found.** Every header Telnyx's own challenge specifies is echoed back correctly, the digest `uri=` matches the Request-URI exactly, and the algorithm/qop match. The response body was `Content-Length: 0` — Telnyx did not send any explanatory reason for the `403`.

**This packet capture cannot, by itself, prove *why* Telnyx rejected a well-formed authenticated request.** Plausible causes that are indistinguishable from the wire alone:
- The actual password configured in `TELNYX_SIP_PASSWORD` doesn't match what's set on the Telnyx SIP Connection's "Credentials Authentication" record (silent typo/rotation).
- The Telnyx SIP Connection requires **both** IP Authentication *and* Credentials (dual-factor), and our source IP isn't in its allowed list, causing a `403` independent of digest correctness.
- An outbound-permissions/Caller-ID-verification restriction on this specific SIP Connection (e.g. Caller ID `+13136506292` or destination area code `+1317` not enabled for outbound) — Telnyx commonly returns bare `403 Forbidden` with no body for these account/portal-level restrictions, indistinguishable from an auth failure at the SIP layer.

**Recommended next evidence step (not a code change):** pull the Telnyx Mission Control Portal → Call Control / SIP Trunking → Logs for Call-ID `hVkh3e0Ks1OmDLEiq78g4Q..` (or the timestamp `2026-07-25 14:51:46 UTC`) — Telnyx's portal typically records the specific internal reason for a `403` (bad credentials vs. IP ACL vs. permissions) that the bare SIP response does not carry.

## Exit criteria assessment

- **A (success)**: not met.
- **B (failure, root cause identified)**: met for the `482` — it is a secondary artifact of Kamailio relaying a carrier failure to the client, which retries and collides on Call-ID/From-tag. **Not yet met for the underlying `403`** — the packet evidence is exhausted (no field mismatch found); resolving it requires Telnyx-side log correlation, which is outside what a packet capture can show.

**No code changes have been made.** Per the frozen investigation plan, no fix will be proposed until the `403`'s cause is confirmed via Telnyx's own logs.
