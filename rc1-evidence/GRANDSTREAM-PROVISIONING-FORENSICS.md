# Grandstream Provisioning Forensics — MAC `EC74D751E3E7`

Reproducible test to prove **exactly where** phone runtime diverges from served `cfg.xml`.

**Constraint:** No Kamailio / NestJS / Redis / PostgreSQL / Telnyx changes. Evidence scripts only.

---

## Baseline (captured 2026-07-26 UTC)

| Field | Value |
|-------|-------|
| URL | `https://prov.vspphone.com/gs/ec74d751e3e7/cfg.xml` |
| HTTP | **200** |
| Size | **660 bytes** |
| SHA-256 | `EC706E3C943FE1452C45E1814246208E4763C37512E853AC9A6EB92CB51397BA` |

Re-fetch before each test run (artifact may change after reprovision):

```bash
curl -sk "https://prov.vspphone.com/gs/ec74d751e3e7/cfg.xml" -o cfg-served.xml
sha256sum cfg-served.xml
```

---

## Prerequisites

| Location | Requirement |
|----------|-------------|
| EC2 | `/opt/vsp-phone-v4`, `docker`, `curl`, `python3`, optional `tcpdump` |
| Phone | Web UI access (`192.168.1.11` or current LAN IP) |
| Network | Phone must reach `prov.vspphone.com:443` and `sip.vspphone.com:5060` |

---

## Test timeline (single controlled run)

```text
T-5min   Phase 1 — baseline cfg.xml + checksum on EC2
T-0      Phase 2 — start EC2 capture
T+0      Reboot GRP2601 (power cycle or web UI reboot)
T+2min   Phone export #1 → phone-export-T0.xml (immediate after boot)
T+3min   Phone export #2 → phone-export-T60.xml (optional timing)
T+8min   Stop EC2 capture (script auto-stops at 8 min)
T+10min  Phase 3 — compare exports vs baseline cfg
```

---

## Phase 1 — Before reboot (EC2)

```bash
cd /opt/vsp-phone-v4/rc1-evidence
export MAC=ec74d751e3e7
export PHONE_IP=122.177.247.143
chmod +x grandstream-provisioning-forensics.sh
./grandstream-provisioning-forensics.sh phase1
```

**Records:** `cfg-served.xml`, `baseline.json`, `SHA256SUMS`, prior API prov history.

---

## Phase 2 — During reboot (EC2)

```bash
export OUTDIR=/tmp/gs-prov-forensics-ec74d751e3e7-$(date -u +%Y%m%dT%H%M%SZ)
./grandstream-provisioning-forensics.sh phase2
# Reboot phone when capture starts
```

**Captures:**

| Stream | Content |
|--------|---------|
| `api-prov-stream.log` | `provisioning.request`, `provisioning.downloaded`, `provisioning.auth.mac_url` |
| `provisioning-events.csv` | timestamp, event, userAgent, httpStatus, requestId, URI |
| `nginx-prov-stream.log` | prov host HTTP access (if nginx log present) |
| `prov-and-sip.pcap` | Phone ↔ HTTPS prov + UDP 5060 |

### Pass criteria for phone download

At least one row in `provisioning-events.csv` with:

- `event=provisioning.downloaded` **or** `provisioning.request` with `httpStatus=200`
- `userAgent` containing **`Grandstream`** or **`GRP2601`**
- `srcIp` = phone public IP (`122.177.247.143`) **or** nginx log showing same

If **only** `curl/*` User-Agent → phone did **not** download in this window.

---

## Phase 3 — Phone export (handset)

### Export running configuration

On GRP2601 web UI:

1. **Maintenance → Upgrade and Provisioning**
2. Use **Export backup Package** *or* **Download Device Configuration** (if shown)
3. Save file as `phone-export-T0.xml` immediately after boot completes (~2 min)

**Timed exports (required for P48 timing):**

| File | When | Purpose |
|------|------|---------|
| `phone-export-T0.xml` | ~2 min post-boot | First runtime state |
| `phone-export-T60.xml` | ~3 min post-boot | Detect post-boot sync overwrite |
| `phone-export-T300.xml` | ~10 min post-boot | Detect delayed auto-provision |

Copy to EC2:

```bash
scp phone-export-T0.xml ubuntu@32.196.41.160:/tmp/gs-prov-forensics-.../
```

### Alternate provisioning source audit (phone UI — photograph each screen)

| Source | Phone UI path | What to record |
|--------|---------------|----------------|
| VSP HTTPS prov | Maintenance → Upgrade/Provisioning | Config Server Path, Upgrade Via, Username/Password |
| DHCP Option 66/43 | Maintenance → DHCP Option… | “Allow DHCP Option 43 and Option 66 to Override Server” |
| DHCP Option 160 | Maintenance → Additional Override DHCP Option | Firmware/prov override selection |
| Firmware server | Maintenance → Firmware Upgrade | Server path, auto-upgrade settings |
| GDMS / TR-069 | System Settings → TR-069 | ACS URL (factory default `https://acs.gdms.cloud`), Enable TR-069 |
| GDMS account | Status → GDMS (if present) | Linked / not linked |
| Manual edits | Accounts → Account 1 | All fields; note User Protection (Maintenance) |
| Factory dial plan | Accounts → Account 1 → Dial Plan | Full rule string |

---

## Phase 4 — Compare (EC2)

```bash
export PHONE_EXPORT=/tmp/gs-prov-forensics-.../phone-export-T0.xml
./grandstream-provisioning-forensics.sh phase3
```

Outputs:

- `pvalue-forensics/pvalue-comparison.csv`
- `pvalue-forensics/FORENSIC-CONCLUSION.txt`

Repeat for `T60` and `T300` exports to localize **when** P48 changes.

---

## P-value comparison table (template)

Fill from `pvalue-comparison.csv` after Phase 4:

| P-value | Expected (served) | Actual (phone) | Match | Reason |
|---------|-------------------|----------------|-------|--------|
| P31 | 1 | | | |
| P34 | *(secret)* | *(secret)* | | Compare presence, not value in reports |
| P35 | 100 | | | |
| P36 | 100 | | | |
| P47 | sip.vspphone.com | | | |
| **P48** | **sip.vspphone.com** | | | |
| P130 | 0 | | | |
| P139 | 5060 | | | |
| P40 | 5060 | | | |
| P271 | 1 | | | |

**First diverging P-value in template order** = first row where Match = NO (script computes automatically).

---

## P48 timing decision matrix

| T0 | T60 | T300 | Download log (Grandstream UA) | Conclusion |
|----|-----|------|----------------------------------|------------|
| blank | blank | blank | **No** Grandstream download | Divergence **before download** — phone never applied served cfg |
| blank | blank | blank | **Yes** 200 | Divergence **during XML parse/apply at P48** (P47 matched) |
| set | blank | blank | Yes | Divergence **after initial apply** — later sync overwrote P48 |
| blank | set | set | Yes | Delayed apply or second config file (check P8467, cfgMAC.xml order) |
| set | set | set | Yes | P48 OK after boot — earlier UI screenshot was stale/manual state |

---

## Served cfg.xml P-value order (apply sequence)

Order in artifact (matters for “first mismatch”):

```text
P1 → P64 → P212 → P8463 → [P1360 P1361] → P237 → [P192] → P271 → P270 → P31
→ P35 → P36 → P34 → P47 → P48 → P139 → P40 → P130 → P3
```

If P47 matches and P48 does not → **first divergence is P48** in served artifact.

---

## Final statement format

After one complete run, `FORENSIC-CONCLUSION.txt` must contain exactly:

```text
The runtime configuration diverges from cfg.xml at step "<STEP>" because <EVIDENCE-BASED REASON>.
```

`<STEP>` must be one of:

- `before HTTP download`
- `during XML P-value apply (first mismatch: Pnnn)`
- `after provisioning (timed export shows change)`
- `alternate provisioning source (manual / DHCP / GDMS / TR-069)`
- `no divergence (full match)`

---

## What this test does **not** assume

- It does not change platform code.
- It does not guess — empty cells remain empty until exports and logs exist.
- Prior Jul 24 UI screenshot (P48 blank) is **historical**; this protocol replaces it with **export + checksum + timed captures**.

---

## Quick local compare (Windows, after phone export)

```powershell
curl.exe -sk "https://prov.vspphone.com/gs/ec74d751e3e7/cfg.xml" -o cfg-served.xml
python rc1-evidence/compare-grandstream-provision.py --served cfg-served.xml --phone phone-export-T0.xml --out forensics-out
```
