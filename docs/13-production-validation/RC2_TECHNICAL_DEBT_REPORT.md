# RC2 Technical Debt Report

| Version | 4.0.0-rc2 |
|---------|-----------|

## Deferred (Post-GA)

| ID | Area | Description | Priority |
|----|------|-------------|----------|
| TD-01 | Media | rtpengine NG stub → production daemon integration | P0 |
| TD-02 | Transfer | SIP REFER implementation validation | P1 |
| TD-03 | Recording | End-to-end file capture pipeline | P1 |
| TD-04 | Observability | Grafana/Alertmanager not bundled | P2 |
| TD-05 | Logging | Centralized log aggregation | P2 |
| TD-06 | Infra UI | Raw JSON on Redis/Kamailio/Postgres/RTPengine pages | P3 |
| TD-07 | Softphone | Video calling (button disabled) | P3 |
| TD-08 | Tenant Settings | Full tenant self-service settings UI | P3 |
| TD-09 | Notifications | Real notification feed (currently static empty state) | P3 |
| TD-10 | Framework | Next.js middleware → proxy migration | P4 |

## Legacy Artifacts (Non-blocking)

- Domain module README files stating "placeholder" — historical; logic lives in tenant-portal/platform-admin modules
- `uploadPlaceholder` in recording upload service — intentional for stub storage path
- `useInfraHealth` deprecated alias — kept for compatibility

## Code Quality (RC2)

- No `TODO`/`FIXME` in `apps/` application source
- No `console.log` in admin/api application code
- All nav modules marked `integration: 'live'`

## Recommended Sprint After Pilot

1. Close TD-01 through TD-03 with live telecom acceptance
2. Replace infra JSON viewers with structured dashboards
3. Implement notification service or remove bell UI until ready
4. Expand tenant settings beyond informational stub
