# Post-Go-Live Verification Guide — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 |

---

## Purpose

Structured verification procedure to confirm VSP Phone v4 is operating correctly after production cutover.

---

## Immediate verification (T+0 to T+2h)

### Platform health

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
curl -H "Authorization: Bearer $JWT" http://localhost:3000/api/v1/cutover/readiness
curl -H "Authorization: Bearer $JWT" http://localhost:3000/api/v1/cutover/status
```

All must return green status.

### Automated smoke tests

```bash
curl -X POST -H "Authorization: Bearer $JWT" \
  http://localhost:3000/api/v1/cutover/smoke-test
```

All 16 tests must pass.

### Migration verification

```bash
curl -H "Authorization: Bearer $JWT" \
  http://localhost:3000/api/v1/migration/verification/{batchId}
```

Batch status must be `verified`.

---

## Functional verification (T+2h to T+24h)

| Area | Test | Pass criteria |
|------|------|---------------|
| Voice | Inbound DID call | Ring, answer, two-way audio |
| Voice | Outbound PSTN call | Connected, CLI correct |
| Voice | Extension-to-extension | Connected |
| WebRTC | Browser client call | Register + call |
| Devices | Grandstream registration | Phone registered, calls work |
| IVR | Menu navigation | DTMF routing correct |
| Queue | Agent answer | Call delivered to agent |
| Conference | Multi-party | All parties hear each other |
| Features | Park/pickup | Call retrieved correctly |
| Recording | Call recording | File created and playable |
| Presence | BLF updates | Lamp state changes |
| Carrier | Telnyx webhook | Events processed |

---

## Report export

Export cutover report for sign-off:

```bash
# JSON
curl -H "Authorization: Bearer $JWT" \
  http://localhost:3000/api/v1/cutover/report

# CSV
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/cutover/report?format=csv"
```

---

## Sign-off criteria

Go-live is considered successful when:

1. All automated smoke tests pass
2. All manual functional tests pass for pilot tenant
3. No P1/P2 alarms active for 2 hours
4. Cutover report exported and reviewed
5. Stakeholder sign-off obtained (Go-Live Checklist)

---

## Related documents

- [Go-Live Checklist](./go-live-checklist.md)
- [Smoke Test Guide](./smoke-test-guide.md)
- [Hypercare Checklist](./hypercare-checklist.md)
