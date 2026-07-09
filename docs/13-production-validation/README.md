# Production Validation — VSP Phone v4 RC1

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Branch** | `release/v4.0.0-rc1` |
| **Purpose** | Production acceptance review — no new features |

Architecture is **frozen**. These documents validate readiness for real telecom traffic.

---

## Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [01-telecom-smoke-tests.md](./01-telecom-smoke-tests.md) | 20-category smoke suite with all verification commands |
| 02 | [02-call-flow-validation.md](./02-call-flow-validation.md) | SIP method checklist + 15 end-to-end call scenarios |
| 03 | [03-api-validation.md](./03-api-validation.md) | Every API endpoint — auth, status, validation |
| 04 | [04-production-checklist.md](./04-production-checklist.md) | Go-live checklist (DNS, TLS, carrier, DR, ops) |
| 05 | [05-go-live-report.md](./05-go-live-report.md) | Acceptance test report template (pass/fail rows) |
| 06 | [06-known-issues.md](./06-known-issues.md) | Classified limitations — Critical/High/Medium/Low |
| 07 | [07-final-acceptance-report.md](./07-final-acceptance-report.md) | Executive acceptance summary + recommendation |
| 08 | [08-platform-bootstrap.md](./08-platform-bootstrap.md) | Super Admin production bootstrap |

---

## EC2 quick verify

```bash
cd /opt/vsp-phone-v4
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
export API="https://127.0.0.1:3000/api"

$COMPOSE ps
curl -sk $API/health | jq .
curl -sk $API/ready | jq .
$COMPOSE exec kamailio kamailio -c -f /tmp/kamailio.runtime.cfg
```

---

## Related

- [RC1_CHECKLIST.md](../12-release/RC1_CHECKLIST.md)
- [smoke-test-guide.md](../10-production/smoke-test-guide.md)
- [go-live-checklist.md](../10-production/go-live-checklist.md)
- [KNOWN_LIMITATIONS.md](../11-final-audit/KNOWN_LIMITATIONS.md)
