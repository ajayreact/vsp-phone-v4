#!/usr/bin/env python3
"""Compare Zoiper vs Grandstream INVITE from pcaps or ASCII sip dumps."""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def extract_invite_text(pcap: Path) -> str:
    if pcap.suffix in {".txt", ".asc"}:
        return pcap.read_text(encoding="utf-8", errors="replace")
    try:
        out = subprocess.check_output(
            ["tshark", "-r", str(pcap), "-Y", "sip.Method==INVITE", "-T", "fields",
             "-e", "frame.time", "-e", "ip.src", "-e", "ip.dst", "-e", "frame.len",
             "-e", "sip.Request-Line", "-e", "sip.Via", "-e", "sip.Route", "-e", "sip.Contact",
             "-e", "sip.From", "-e", "sip.To", "-e", "sip.User-Agent", "-e", "sip.Content-Length",
             "-e", "sip.msg", "-E", "separator=|"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        out = subprocess.check_output(
            ["tcpdump", "-nn", "-A", "-s0", "-r", str(pcap)],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    # First INVITE block
    m = re.search(r"(INVITE sip:.*?)(?=\n(?:SIP/2\.0|\Z))", out, re.S)
    return m.group(1) if m else out[:4000]


def parse_fields(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    lines = text.splitlines()
    if lines:
        fields["Request-URI"] = lines[0].replace("INVITE ", "").split(" SIP/2.0")[0]
    for line in lines[1:]:
        if not line or line.startswith("v=") or line.startswith("m=") or line.startswith("a="):
            continue
        if ":" in line:
            k, _, v = line.partition(":")
            fields[k.strip()] = v.strip()
    sdp_start = text.find("v=0")
    if sdp_start >= 0:
        fields["SDP"] = text[sdp_start:].strip()
        codecs = re.findall(r"m=audio \d+ ([^\r\n]+)", fields["SDP"])
        fields["SDP codecs (m= lines)"] = "; ".join(codecs) if codecs else ""
    cl = re.search(r"Content-Length:\s*(\d+)", text, re.I)
    if cl:
        fields["Content-Length"] = cl.group(1)
    fields["Approx message size"] = str(len(text.encode("utf-8", errors="replace")))
    return fields


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zoiper", required=True, type=Path)
    ap.add_argument("--grandstream", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    zt = extract_invite_text(args.zoiper)
    gt = extract_invite_text(args.grandstream)
    zf = parse_fields(zt)
    gf = parse_fields(gt)
    keys = sorted(set(zf) | set(gf))
    lines = ["| Field | Zoiper | Grandstream | Match |", "|-------|--------|-------------|-------|"]
    for k in keys:
        a, b = zf.get(k, ""), gf.get(k, "")
        match = "YES" if a == b and a else ("NO" if a != b else "—")
        lines.append(f"| {k} | {a[:120]} | {b[:120]} | {match} |")
    md = "\n".join(lines)
    (args.out / "comparison.md").write_text(md, encoding="utf-8")
    (args.out / "zoiper-invite.txt").write_text(zt, encoding="utf-8")
    (args.out / "grandstream-invite.txt").write_text(gt, encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
