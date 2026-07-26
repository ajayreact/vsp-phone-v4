#!/usr/bin/env python3
"""
Compare served Grandstream cfg.xml P-values against phone-exported configuration.
Outputs CSV table + first-divergence analysis. No platform code changes.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
import xml.etree.ElementTree as ET
from pathlib import Path

# P-values emitted by VSP template (template-engine.service.ts renderGrandstream)
SERVED_P_ORDER = [
    "P1",
    "P64",
    "P212",
    "P8463",
    "P1360",
    "P1361",
    "P237",
    "P192",
    "P271",
    "P270",
    "P31",
    "P35",
    "P36",
    "P34",
    "P47",
    "P48",
    "P139",
    "P40",
    "P130",
    "P3",
    "P207",
    "P208",
    "P1387",
    "P82307",
    "P290",
    "P729",
    "P772",
    "P57",
    "P22421",
]

UI_FIELD_HINT = {
    "P1": "Admin password (web UI)",
    "P31": "Account 1 → Account Active",
    "P34": "Account 1 → SIP Authentication Password",
    "P35": "Account 1 → SIP User ID",
    "P36": "Account 1 → SIP Authentication ID",
    "P47": "Account 1 → SIP Server",
    "P48": "Account 1 → Outbound Proxy",
    "P130": "Account 1 → SIP Transport (0=UDP,1=TCP,2=TLS)",
    "P139": "Account 1 → SIP Server Port",
    "P40": "Account 1 → SIP Server Port (alt)",
    "P212": "Maintenance → Config Upgrade Via (2=HTTPS)",
    "P237": "Maintenance → Config Server Path",
    "P192": "Maintenance → Firmware Server",
    "P271": "Account enable (template)",
    "P270": "Account display label",
    "P3": "Account Name / Name field",
    "P64": "System → Timezone",
    "P8463": "Maintenance → Validate Server Certificate",
    "P207": "Maintenance → Syslog Server (IP:port)",
    "P208": "Maintenance → Syslog Level (1=DEBUG)",
    "P1387": "Maintenance → Send SIP Log",
    "P290": "Account 1 → Dial Plan",
    "P729": "Account 1 → Early Dial",
    "P772": "Account 1 → Use # as Send Key",
    "P57": "Account 1 → Preferred Vocoder (0=PCMU)",
    "P22421": "Force reboot after cfg apply",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest().upper()


def parse_pvalues(xml_path: Path) -> dict[str, str]:
    text = xml_path.read_text(encoding="utf-8", errors="replace")
    root = ET.fromstring(text)
    out: dict[str, str] = {}
    for elem in root.iter():
        tag = elem.tag
        if re.fullmatch(r"P\d+", tag):
            out[tag] = (elem.text or "").strip()
    return out


def normalize_empty(v: str | None) -> str:
    if v is None:
        return ""
    return v.strip()


def reason_for_mismatch(p: str, expected: str, actual: str) -> str:
    if expected and not actual:
        if p == "P48":
            return "Expected from served cfg but blank on phone — divergence at P48 apply (P47 already matched or earlier P-values matched)"
        return "Expected in served cfg but absent/blank on phone export"
    if not expected and actual:
        return "Present on phone but not in served cfg — alternate source (manual UI, factory default, DHCP, GDMS/TR-069, or older config)"
    if expected != actual:
        return "Value mismatch between served artifact and phone export"
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--served", required=True, type=Path)
    ap.add_argument("--phone", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    served_p = parse_pvalues(args.served)
    phone_p = parse_pvalues(args.phone)

    # Also accept phone exports that wrap P-values differently
    if not phone_p:
        for m in re.finditer(r"<(P\d+)>([^<]*)</\1>", args.phone.read_text(encoding="utf-8", errors="replace")):
            phone_p[m.group(1)] = m.group(2).strip()

    rows: list[dict[str, str]] = []
    first_divergence: str | None = None

    for p in SERVED_P_ORDER:
        expected = normalize_empty(served_p.get(p))
        if expected == "" and p not in served_p:
            continue  # not in served artifact (optional lines like P1360/P192)
        actual = normalize_empty(phone_p.get(p))
        match = "YES" if expected == actual else "NO"
        reason = "" if match == "YES" else reason_for_mismatch(p, expected, actual)
        if match == "NO" and first_divergence is None:
            first_divergence = p
        rows.append(
            {
                "P-value": p,
                "UI field": UI_FIELD_HINT.get(p, ""),
                "Expected (served cfg.xml)": expected,
                "Actual (phone export)": actual,
                "Match": match,
                "Reason": reason,
            }
        )

    csv_path = args.out / "pvalue-comparison.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    summary_path = args.out / "FORENSIC-CONCLUSION.txt"
    served_sha = sha256_file(args.served)
    phone_sha = sha256_file(args.phone)

    p48_row = next((r for r in rows if r["P-value"] == "P48"), None)
    conclusion_step = "UNKNOWN — run timed exports (T+0, T+60s, T+300s) per protocol"
    conclusion_because = "insufficient timed exports to localize when P48 changes"

    if first_divergence:
        if first_divergence == "P48" and p48_row and p48_row["Match"] == "NO":
            # Check if all prior served P-values matched
            prior = [r for r in rows if SERVED_P_ORDER.index(r["P-value"]) < SERVED_P_ORDER.index("P48")]
            prior_ok = all(r["Match"] == "YES" for r in prior if r["Expected (served cfg.xml)"])
            if prior_ok:
                conclusion_step = "XML P-value apply on phone (after successful download)"
                conclusion_because = (
                    "P47 and all earlier served P-values match phone export, but P48 does not — "
                    "firmware did not persist P48 from the served cfg.xml (not a server generation defect)"
                )
            else:
                first_prior_bad = next(r for r in prior if r["Match"] == "NO")
                conclusion_step = f"XML P-value apply at or before {first_prior_bad['P-value']}"
                conclusion_because = (
                    f"First served P-value mismatch is {first_prior_bad['P-value']}, before P48 — "
                    "partial apply or mixed manual/provisioned state"
                )
        else:
            conclusion_step = f"XML P-value apply at or before {first_divergence}"
            conclusion_because = (
                f"First served P-value mismatch in template order is {first_divergence}"
            )

    summary_path.write_text(
        "\n".join(
            [
                "Grandstream provisioning forensic summary",
                f"Served cfg: {args.served} SHA-256={served_sha}",
                f"Phone export: {args.phone} SHA-256={phone_sha}",
                f"First diverging P-value (template order): {first_divergence or 'NONE — full match'}",
                "",
                "FINAL STATEMENT (fill timed-export columns if P48 timing still ambiguous):",
                f'The runtime configuration diverges from cfg.xml at step "{conclusion_step}" because {conclusion_because}.',
                "",
                "P48 status:",
                f"  Expected: {p48_row['Expected (served cfg.xml)'] if p48_row else 'n/a'}",
                f"  Actual:   {p48_row['Actual (phone export)'] if p48_row else 'n/a'}",
                f"  Match:    {p48_row['Match'] if p48_row else 'n/a'}",
                "",
                "Alternate provisioning source checklist (verify on phone web UI):",
                "  - Maintenance → Upgrade/Provisioning: Config Server Path, DHCP override flags",
                "  - Network → Basic/DHCP: Option 43/66/120/160 override",
                "  - System Settings → TR-069: ACS URL (default acs.gdms.cloud if enabled)",
                "  - GDMS cloud account linked to MAC",
                "  - Manual Account 1 edits (User Protection off)",
                "  - Factory defaults for dial plan / codecs (not in served cfg)",
            ]
        ),
        encoding="utf-8",
    )

    print(f"Wrote {csv_path}")
    print(f"Wrote {summary_path}")
    print(summary_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
