#!/usr/bin/env python3
"""Packet-by-packet SIP ladder comparison: reference PBX vs Kamailio.

Usage:
  compare-pbx-ladders.py \\
    --ref-pcap /tmp/asterisk-baseline/all.pcap --ref-call <Call-ID-substring> \\
    --kam-pcap /tmp/teardown-capture/docker.pcap --kam-call <Call-ID-substring> \\
    --phone-ip 122.177.246.92 \\
    --out /tmp/pbx-interop-report.txt

Compares aligned signaling milestones on desk and carrier legs through BYE.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Optional

TELNYX_NETS = ("192.76.120.", "64.16.250.", "185.246.", "103.115.244.")
HEADER_FIELDS = [
    "Request-URI",
    "Via",
    "From",
    "To",
    "Call-ID",
    "CSeq",
    "Contact",
    "Record-Route",
    "Route",
    "Max-Forwards",
    "Reason",
    "Content-Type",
    "Content-Length",
    "Allow",
    "Supported",
    "User-Agent",
    "P-Asserted-Identity",
    "Remote-Party-ID",
    "Session-Expires",
    "Min-SE",
    "Diversion",
]

MILESTONES = [
    ("desk_invite", "DESK", "INVITE", "request"),
    ("desk_100", "DESK", "100", "response"),
    ("desk_183", "DESK", "183", "response"),
    ("desk_200", "DESK", "200", "response"),
    ("desk_ack", "DESK", "ACK", "request"),
    ("carrier_invite", "CARRIER", "INVITE", "request"),
    ("carrier_407", "CARRIER", "407", "response"),
    ("carrier_ack407", "CARRIER", "ACK", "request"),
    ("carrier_invite_auth", "CARRIER", "INVITE", "request"),
    ("carrier_183", "CARRIER", "183", "response"),
    ("carrier_200", "CARRIER", "200", "response"),
    ("carrier_ack", "CARRIER", "ACK", "request"),
    ("desk_bye", "DESK", "BYE", "request"),
    ("desk_bye_200", "DESK", "200", "response"),
    ("carrier_bye", "CARRIER", "BYE", "request"),
    ("carrier_bye_200", "CARRIER", "200", "response"),
]


@dataclass
class SipMsg:
    ts: str
    src: str
    dst: str
    start: str
    headers: dict[str, list[str]] = field(default_factory=dict)
    raw: str = ""
    sdp: str = ""

    @property
    def method(self) -> str:
        if self.start.startswith("SIP/2.0"):
            parts = self.start.split()
            return parts[1] if len(parts) > 1 else "RESP"
        return self.start.split()[0]

    @property
    def status(self) -> str:
        return self.method if self.start.startswith("SIP/2.0") else ""

    @property
    def is_request(self) -> bool:
        return not self.start.startswith("SIP/2.0")

    def field(self, name: str) -> str:
        if name == "Request-URI":
            if self.start.startswith("SIP/2.0"):
                return ""
            return self.start.split(" ", 1)[1] if " " in self.start else ""
        vals = self.headers.get(name, [])
        return vals[0] if vals else ""

    def all_fields(self, name: str) -> list[str]:
        if name == "Request-URI":
            r = self.field("Request-URI")
            return [r] if r else []
        return self.headers.get(name, [])


def parse_pcap(pcap: str, callid: str) -> list[SipMsg]:
    raw = subprocess.check_output(
        ["sudo", "tcpdump", "-nn", "-tttt", "-A", "-s0", "-r", pcap],
        stderr=subprocess.DEVNULL,
    ).decode("latin1", "replace")
    blocks = re.split(r"(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ IP )", raw)
    out: list[SipMsg] = []
    for b in blocks:
        if callid and callid not in b:
            continue
        hdr_m = re.match(
            r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ IP )(\S+) > (\S+): (?:UDP|TCP|SIP)",
            b,
        )
        if not hdr_m:
            continue
        ts = b.split(" IP ", 1)[0].strip()
        src, dst = hdr_m.group(2), hdr_m.group(3)
        lines = b.splitlines()
        start = ""
        body_start = 0
        for i, line in enumerate(lines):
            if " SIP: " in line:
                start = line.split(" SIP: ", 1)[1].strip()
                body_start = i + 1
                break
        if not start:
            for i, line in enumerate(lines):
                if line.startswith(
                    ("SIP/2.0", "INVITE ", "ACK ", "BYE ", "CANCEL ", "OPTIONS ", "REGISTER ")
                ):
                    start = line.strip()
                    body_start = i + 1
                    break
        if not start:
            continue
        msg_lines = [start]
        in_sdp = False
        sdp_lines: list[str] = []
        for line in lines[body_start:]:
            if re.match(r"^[0-9a-f]{4}\s", line) or re.match(r"^\d{4}-\d{2}-\d{2} ", line):
                break
            if line.startswith(("E..", "Eh")):
                continue
            msg_lines.append(line.rstrip())
            if line.strip() == "":
                in_sdp = True
                continue
            if in_sdp:
                sdp_lines.append(line.rstrip())
        raw_msg = "\n".join(msg_lines)
        headers: dict[str, list[str]] = {}
        for line in msg_lines[1:]:
            if not line.strip():
                break
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            headers.setdefault(k.strip(), []).append(v.strip())
        out.append(
            SipMsg(
                ts=ts,
                src=src,
                dst=dst,
                start=start,
                headers=headers,
                raw=raw_msg,
                sdp="\n".join(sdp_lines),
            )
        )
    out.sort(key=lambda m: m.ts)
    return out


def is_telnyx(ip: str) -> bool:
    return any(ip.startswith(p) for p in TELNYX_NETS)


def classify_leg(msg: SipMsg, phone_ip: str, proxy_ips: set[str]) -> str:
    if phone_ip and (phone_ip in msg.src or phone_ip in msg.dst):
        return "DESK"
    if is_telnyx(msg.src) or is_telnyx(msg.dst):
        return "CARRIER"
    if any(p in msg.src or p in msg.dst for p in proxy_ips):
        return "PROXY"
    return "OTHER"


def pick_milestone(
    msgs: list[SipMsg],
    leg: str,
    code_or_method: str,
    kind: str,
    phone_ip: str,
    proxy_ips: set[str],
    *,
    skip: int = 0,
    cseq_filter: Optional[str] = None,
) -> Optional[SipMsg]:
    n = 0
    for m in msgs:
        if classify_leg(m, phone_ip, proxy_ips) != leg:
            continue
        if kind == "request":
            if not m.is_request or m.method != code_or_method:
                continue
        else:
            if not m.start.startswith("SIP/2.0") or m.status != code_or_method:
                continue
            if code_or_method == "200" and cseq_filter and cseq_filter not in m.field("CSeq"):
                continue
        if n < skip:
            n += 1
            continue
        return m
    return None


def build_milestones(
    msgs: list[SipMsg], phone_ip: str, proxy_ips: set[str]
) -> dict[str, Optional[SipMsg]]:
    out: dict[str, Optional[SipMsg]] = {}
    carrier_invites = [
        m
        for m in msgs
        if classify_leg(m, phone_ip, proxy_ips) == "CARRIER"
        and m.is_request
        and m.method == "INVITE"
    ]
    out["desk_invite"] = pick_milestone(msgs, "DESK", "INVITE", "request", phone_ip, proxy_ips)
    out["desk_100"] = pick_milestone(msgs, "DESK", "100", "response", phone_ip, proxy_ips)
    out["desk_183"] = pick_milestone(
        msgs, "DESK", "183", "response", phone_ip, proxy_ips, cseq_filter="INVITE"
    )
    out["desk_200"] = pick_milestone(
        msgs, "DESK", "200", "response", phone_ip, proxy_ips, cseq_filter="INVITE"
    )
    # First post-200 ACK on desk leg (not 407 ACK)
    desk_200 = out["desk_200"]
    out["desk_ack"] = None
    if desk_200:
        for m in msgs:
            if (
                classify_leg(m, phone_ip, proxy_ips) == "DESK"
                and m.is_request
                and m.method == "ACK"
                and m.ts > desk_200.ts
            ):
                out["desk_ack"] = m
                break
    out["carrier_invite"] = carrier_invites[0] if carrier_invites else None
    out["carrier_407"] = pick_milestone(msgs, "CARRIER", "407", "response", phone_ip, proxy_ips)
    out["carrier_ack407"] = pick_milestone(
        msgs, "CARRIER", "ACK", "request", phone_ip, proxy_ips, skip=0
    )
    if out["carrier_ack407"] and out["carrier_invite"]:
        if out["carrier_ack407"].ts <= out["carrier_invite"].ts:
            out["carrier_ack407"] = pick_milestone(
                msgs, "CARRIER", "ACK", "request", phone_ip, proxy_ips, skip=1
            )
    out["carrier_invite_auth"] = carrier_invites[1] if len(carrier_invites) > 1 else carrier_invites[0]
    out["carrier_183"] = pick_milestone(
        msgs, "CARRIER", "183", "response", phone_ip, proxy_ips, cseq_filter="INVITE"
    )
    out["carrier_200"] = pick_milestone(
        msgs, "CARRIER", "200", "response", phone_ip, proxy_ips, cseq_filter="INVITE"
    )
    carrier_200 = out["carrier_200"]
    out["carrier_ack"] = None
    if carrier_200:
        for m in msgs:
            if (
                classify_leg(m, phone_ip, proxy_ips) == "CARRIER"
                and m.is_request
                and m.method == "ACK"
                and m.ts > carrier_200.ts
            ):
                out["carrier_ack"] = m
                break
    out["desk_bye"] = pick_milestone(msgs, "DESK", "BYE", "request", phone_ip, proxy_ips)
    out["desk_bye_200"] = None
    if out["desk_bye"]:
        for m in msgs:
            if (
                classify_leg(m, phone_ip, proxy_ips) == "DESK"
                and m.status == "200"
                and "BYE" in m.field("CSeq")
                and m.ts > out["desk_bye"].ts
            ):
                out["desk_bye_200"] = m
                break
    out["carrier_bye"] = pick_milestone(msgs, "CARRIER", "BYE", "request", phone_ip, proxy_ips)
    out["carrier_bye_200"] = None
    if out["carrier_bye"]:
        for m in msgs:
            if (
                classify_leg(m, phone_ip, proxy_ips) == "CARRIER"
                and m.status == "200"
                and "BYE" in m.field("CSeq")
                and m.ts > out["carrier_bye"].ts
            ):
                out["carrier_bye_200"] = m
                break
    return out


def norm(v: str) -> str:
    return re.sub(r"\s+", " ", v.strip())


def compare_msg(
    name: str, ref: Optional[SipMsg], kam: Optional[SipMsg]
) -> list[tuple[str, str, str, str]]:
    diffs: list[tuple[str, str, str, str]] = []
    if ref is None and kam is None:
        return diffs
    if ref is None:
        diffs.append((name, "MISSING", "present", "reference missing message"))
        return diffs
    if kam is None:
        diffs.append((name, "present", "MISSING", "kamailio missing message"))
        return diffs

    for fld in HEADER_FIELDS:
        rv = ref.all_fields(fld)
        kv = kam.all_fields(fld)
        if fld == "Request-URI":
            rv = [ref.field("Request-URI")] if ref.field("Request-URI") else []
            kv = [kam.field("Request-URI")] if kam.field("Request-URI") else []
        if rv == kv:
            continue
        diffs.append((f"{name}/{fld}", repr(rv), repr(kv), ""))

    if norm(ref.sdp) != norm(kam.sdp):
        if ref.sdp or kam.sdp:
            diffs.append(
                (
                    f"{name}/SDP",
                    ref.sdp[:200] + ("..." if len(ref.sdp) > 200 else ""),
                    kam.sdp[:200] + ("..." if len(kam.sdp) > 200 else ""),
                    "SDP body differs",
                )
            )
    return diffs


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare reference PBX vs Kamailio SIP ladders")
    ap.add_argument("--ref-pcap", required=True)
    ap.add_argument("--ref-call", required=True)
    ap.add_argument("--kam-pcap", required=True)
    ap.add_argument("--kam-call", required=True)
    ap.add_argument("--phone-ip", default="")
    ap.add_argument("--proxy-ip", action="append", default=["172.31.39.116", "32.196.41.160"])
    ap.add_argument(
        "--carrier-only",
        action="store_true",
        help="Compare only carrier-leg milestones (skip desk_* when ref has no phone leg)",
    )
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    proxy_ips = set(args.proxy_ip)
    ref_msgs = parse_pcap(args.ref_pcap, args.ref_call)
    kam_msgs = parse_pcap(args.kam_pcap, args.kam_call)
    if not ref_msgs:
        print(f"ERROR: no SIP in reference pcap for {args.ref_call}", file=sys.stderr)
        return 1
    if not kam_msgs:
        print(f"ERROR: no SIP in kamailio pcap for {args.kam_call}", file=sys.stderr)
        return 1

    ref_ms = build_milestones(ref_msgs, args.phone_ip, proxy_ips)
    kam_ms = build_milestones(kam_msgs, args.phone_ip, proxy_ips)

    lines: list[str] = []
    lines.append("# PBX Interoperability Comparison")
    lines.append("")
    lines.append(f"Reference: {args.ref_pcap} Call-ID~{args.ref_call}")
    lines.append(f"Kamailio:  {args.kam_pcap} Call-ID~{args.kam_call}")
    lines.append(f"Phone IP:  {args.phone_ip or '(none — carrier-only compare)'}")
    lines.append("")

    lines.append("## Milestone presence")
    lines.append("| Milestone | Reference | Kamailio |")
    lines.append("|-----------|-----------|----------|")
    for key, _, _, _ in MILESTONES:
        r = "YES" if ref_ms.get(key) else "NO"
        k = "YES" if kam_ms.get(key) else "NO"
        flag = " **" if r != k else ""
        lines.append(f"| {key} | {r} | {k}{flag} |")
    lines.append("")

    # Per-milestone summary table (FreePBX vs Kamailio header fields)
    lines.append("## SIP element comparison (aligned milestones)")
    lines.append("| SIP Element | FreePBX (Reference) | Our PBX (Kamailio) | Match | Difference |")
    lines.append("|-------------|---------------------|--------------------|-------|------------|")
    compare_keys = [
        ("desk_200", "Contact"),
        ("desk_200", "From"),
        ("desk_200", "To"),
        ("desk_200", "Record-Route"),
        ("desk_ack", "Request-URI"),
        ("desk_ack", "CSeq"),
        ("carrier_200", "Contact"),
        ("carrier_200", "Record-Route"),
        ("carrier_ack", "Request-URI"),
        ("carrier_ack", "Route"),
        ("carrier_ack", "From"),
        ("carrier_ack", "To"),
        ("carrier_ack", "CSeq"),
        ("carrier_ack", "Call-ID"),
        ("carrier_bye", "Reason"),
    ]
    for key, fld in compare_keys:
        ref_m = ref_ms.get(key)
        kam_m = kam_ms.get(key)
        ref_v = ref_m.field(fld) if ref_m else ""
        kam_v = kam_m.field(fld) if kam_m else ""
        if ref_m is None and kam_m is None:
            continue
        if not ref_v and not kam_v and fld not in ("Request-URI",):
            continue
        match = "YES" if norm(ref_v) == norm(kam_v) else "NO"
        diff = ""
        if match == "NO":
            if not ref_m:
                diff = "reference missing milestone"
            elif not kam_m:
                diff = "kamailio missing milestone"
            elif not ref_v and kam_v:
                diff = "present only on kamailio"
            elif ref_v and not kam_v:
                diff = "present only on reference"
            else:
                diff = "value mismatch"
        lines.append(
            f"| {key}/{fld} | `{ref_v[:120]}` | `{kam_v[:120]}` | {match} | {diff} |"
        )
    lines.append("")

    first_div: Optional[tuple[str, str, str, str]] = None
    all_diffs: list[tuple[str, str, str, str]] = []
    skip_desk = args.carrier_only
    for key, _, _, _ in MILESTONES:
        if skip_desk and key.startswith("desk_"):
            continue
        diffs = compare_msg(key, ref_ms.get(key), kam_ms.get(key))
        if diffs and first_div is None:
            first_div = diffs[0]
        all_diffs.extend(diffs)

    lines.append("## First protocol divergence")
    if first_div:
        fld, ref_v, kam_v, note = first_div
        lines.append(f"**Milestone/field:** `{fld}`")
        if note:
            lines.append(f"**Note:** {note}")
        lines.append(f"- Reference: `{ref_v}`")
        lines.append(f"- Kamailio:  `{kam_v}`")
    else:
        lines.append("No header/SDP differences at aligned milestones (or both sides missing same messages).")
    lines.append("")

    # Architecture / ACK ownership (B2BUA gate)
    lines.append("## Architecture — ACK ownership")
    lines.append("| Check | Reference (Asterisk) | Kamailio | Required |")
    lines.append("|-------|----------------------|----------|----------|")
    ref_ack = ref_ms.get("carrier_ack")
    kam_ack = kam_ms.get("carrier_ack")
    ref_200 = ref_ms.get("carrier_200")
    kam_200 = kam_ms.get("carrier_200")
    lines.append(
        f"| carrier_ack present | {'YES' if ref_ack else 'NO'} | {'YES' if kam_ack else 'NO'} | YES |"
    )
    def _ack_delta(m200, mack):
        if not m200 or not mack:
            return "n/a"
        try:
            from datetime import datetime
            fmt = "%Y-%m-%d %H:%M:%S.%f"
            t0 = datetime.strptime(m200.ts[:26], fmt)
            t1 = datetime.strptime(mack.ts[:26], fmt)
            return f"{(t1-t0).total_seconds()*1000:.1f} ms"
        except Exception:
            return "parse-error"
    lines.append(
        f"| 200→ACK latency | {_ack_delta(ref_200, ref_ack)} | {_ack_delta(kam_200, kam_ack)} | <50 ms (UAC) |"
    )
    ref_cid = ref_ack.field("Call-ID") if ref_ack else (ref_200.field("Call-ID") if ref_200 else "")
    desk_inv = kam_ms.get("desk_invite")
    kam_carrier_cid = kam_ack.field("Call-ID") if kam_ack else (kam_200.field("Call-ID") if kam_200 else "")
    desk_cid = desk_inv.field("Call-ID") if desk_inv else ""
    split = "YES" if desk_cid and kam_carrier_cid and desk_cid != kam_carrier_cid else ("NO (same Call-ID hybrid)" if desk_cid else "n/a")
    lines.append(f"| Separate Call-ID per leg | YES (B2BUA) | {split} | YES for true B2BUA |")
    lines.append("")
    lines.append(
        "**Gate:** Kamailio must emit carrier ACK as local UAC (~1 ms after 200), "
        "independent of Grandstream desk ACK — matching Asterisk."
    )
    lines.append("")

    lines.append("## Full diff table")
    for fld, ref_v, kam_v, note in all_diffs:
        lines.append(f"### {fld}")
        lines.append(f"- Reference: `{ref_v}`")
        lines.append(f"- Kamailio:  `{kam_v}`")
        if note:
            lines.append(f"- Note: {note}")
        lines.append("")

    lines.append("## Reference ladder (milestones)")
    for key, _, _, _ in MILESTONES:
        m = ref_ms.get(key)
        if m:
            lines.append(f"### REF {key} @ {m.ts}")
            lines.append("```")
            lines.append(m.raw[:4000])
            lines.append("```")
    lines.append("## Kamailio ladder (milestones)")
    for key, _, _, _ in MILESTONES:
        m = kam_ms.get(key)
        if m:
            lines.append(f"### KAM {key} @ {m.ts}")
            lines.append("```")
            lines.append(m.raw[:4000])
            lines.append("```")

    report = "\n".join(lines)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"Wrote {args.out}")
    else:
        print(report)

    if first_div:
        print(f"\nFIRST DIVERGENCE: {first_div[0]}", file=sys.stderr)
        print(f"  REF: {first_div[1]}", file=sys.stderr)
        print(f"  KAM: {first_div[2]}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
