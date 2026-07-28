#!/usr/bin/env python3
"""Extract full SIP ladder (INVITE→BYE) from pcap for protocol comparison."""
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Optional

FIELDS = [
    "Request-URI",
    "Route",
    "Record-Route",
    "Contact",
    "Via",
    "Call-ID",
    "From",
    "To",
    "CSeq",
    "Max-Forwards",
    "Reason",
    "Content-Length",
]


@dataclass
class SipMsg:
    ts: str
    flow: str
    src: str
    dst: str
    transport: str
    start: str
    headers: dict = field(default_factory=dict)
    raw: str = ""

    @property
    def method(self) -> str:
        if self.start.startswith("SIP/2.0"):
            return self.start.split(" ", 2)[1] if len(self.start.split(" ")) > 1 else "RESP"
        return self.start.split(" ", 1)[0]

    @property
    def is_carrier_leg(self) -> bool:
        return "192.76.120.10" in self.flow or "64.16.250.10" in self.flow

    def branch(self) -> str:
        vias = self.headers.get("Via", [])
        if not vias:
            return ""
        m = re.search(r"branch=([^;>\s]+)", vias[0])
        return m.group(1) if m else ""

    def field(self, name: str) -> str:
        if name == "Request-URI":
            if self.start.startswith("SIP/2.0"):
                return ""
            return self.start.split(" ", 1)[1] if " " in self.start else ""
        vals = self.headers.get(name, [])
        return vals[0] if vals else ""


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
        transport = "UDP"
        if ": TCP," in b.splitlines()[0] or " TCP " in b.splitlines()[0]:
            transport = "TCP"
        flow = f"{src} > {dst}"
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
                if line.startswith(("SIP/2.0", "INVITE ", "ACK ", "BYE ", "CANCEL ", "OPTIONS ")):
                    start = line.strip()
                    body_start = i + 1
                    break
        if not start:
            continue
        msg_lines = [start]
        for line in lines[body_start:]:
            if re.match(r"^[0-9a-f]{4}\s", line):
                break
            if line.startswith("E..") or line.startswith("Eh"):
                continue
            if re.match(r"^\d{4}-\d{2}-\d{2} ", line):
                break
            msg_lines.append(line.rstrip())
            if line.strip() == "" and len(msg_lines) > 4:
                break
        raw_msg = "\n".join(msg_lines)
        if not raw_msg:
            continue
        headers: dict[str, list[str]] = {}
        for line in msg_lines[1:]:
            if not line.strip():
                break
            if line.startswith((" ", "\t")):
                continue
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            headers.setdefault(k.strip(), []).append(v.strip())
        out.append(
            SipMsg(
                ts=ts,
                flow=flow,
                src=src,
                dst=dst,
                transport=transport,
                start=start,
                headers=headers,
                raw=raw_msg,
            )
        )
    return out


def print_ladder(msgs: list[SipMsg]) -> None:
    print("=== FULL SIP LADDER (carrier + phone legs) ===")
    for m in msgs:
        leg = "CARRIER" if m.is_carrier_leg else "PHONE"
        print(f"\n--- [{leg}] {m.ts} {m.flow} ---")
        print(m.raw[:3500])
        if len(m.raw) > 3500:
            print("... [truncated]")


def carrier_ladder(msgs: list[SipMsg]) -> list[SipMsg]:
    return [m for m in msgs if m.is_carrier_leg]


def compare_fields(ok200: SipMsg, ack: Optional[SipMsg]) -> None:
    print("\n=== PROTOCOL FIELD COMPARISON (Telnyx 200 OK vs Kamailio ACK) ===")
    print(f"{'Field':<18} {'200 OK':<55} {'ACK':<55} {'RFC/Telnyx'}")
    print("-" * 140)
    for name in FIELDS:
        v200 = ok200.field(name) if name != "Request-URI" else ok200.headers.get("Contact", [""])[0]
        vack = ack.field(name) if ack else ""
        note = ""
        if name == "Request-URI":
            note = "RFC3261 §12.2.1.1: ACK R-URI = Contact"
        elif name == "CSeq":
            note = "Same number as 200 OK INVITE, method ACK"
        elif name == "Route":
            note = "Telnyx P01: same order as INVITE Record-Route"
        elif name == "Via":
            note = "New branch; sent-by = our public IP"
        rows = max(len(v200), len(vack), 1)
        for i in range(rows):
            a = (v200[:52] + "..") if len(v200) > 54 else v200
            b = (vack[:52] + "..") if len(vack) > 54 else vack
            n = note if i == 0 else ""
            print(f"{name:<18} {a:<55} {b:<55} {n}")
    if ack:
        print(f"\nACK dst socket: {ack.dst}  src: {ack.src}  transport: {ack.transport}")
        c200 = ok200.field("Contact")
        ruri = ack.field("Request-URI")
        cseq200 = ok200.field("CSeq").split()[0]
        cseqack = ack.field("CSeq").split()[0] if ack.field("CSeq") else ""
        print(f"R-URI matches Contact: {'YES' if c200.strip('<>') in ruri or ruri in c200 else 'NO'}")
        print(f"CSeq number match: {'YES' if cseq200 == cseqack else 'NO'} ({cseq200} vs {cseqack})")


def main() -> int:
    if len(sys.argv) < 3:
        print(f"usage: {sys.argv[0]} <pcap> <callid-substring>", file=sys.stderr)
        return 2
    pcap, cid = sys.argv[1], sys.argv[2]
    msgs = parse_pcap(pcap, cid)
    if not msgs:
        print("ERROR: no SIP messages found", file=sys.stderr)
        return 1
    print_ladder(msgs)
    car = carrier_ladder(msgs)
    print("\n=== CARRIER LEG SUMMARY ===")
    for m in car:
        print(f"{m.ts}  {m.method:12}  {m.flow}")
    ok200 = None
    post_acks = []
    for m in car:
        if m.start.startswith("SIP/2.0 200") and "INVITE" in m.field("CSeq"):
            if ok200 is None:
                ok200 = m
        if m.method == "ACK" and ok200 and m.ts > ok200.ts:
            post_acks.append(m)
    ack = post_acks[0] if post_acks else None
    if ok200:
        compare_fields(ok200, ack)
    else:
        print("\nERROR: no carrier 200 OK found", file=sys.stderr)
    if not ack:
        print("\n*** DEFECT: NO POST-200 ACK ON WIRE (Telnyx will retransmit 200 OK → 408 ACK Timeout @ 32s) ***")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
