# Testing Strategy — VSP Phone v4

| Version | 4.0.0-rc1 |
|---------|-----------|

Quality gates, validation scripts, and testing approach for RC1.

---

## Testing philosophy

VSP Phone v4 RC1 relies on:

1. **Static validation scripts** — contract and wiring verification without live telecom
2. **Build and lint gates** — TypeScript compilation and ESLint
3. **Smoke tests** — configuration and health probes (Phase 20)
4. **Manual call verification** — required for audio path acceptance
5. **Operational checklists** — staging sign-off before production

Automated E2E call placement is **not** included in CI validators.

---

## RC1 quality gate commands

Run in order before staging deployment:

```bash
npm ci
npm run build
npx nx build api
npx nx build admin
npx nx lint api
npx nx lint admin
npm run telecom:validate:phase20
npm run telecom:validate:remediation
```

All must pass for RC1 approval.

---

## Validation script matrix

| Script | Scope |
|--------|-------|
| `kamailio:validate` | Kamailio cfg static checks |
| `rtpengine:validate` | RTPengine config |
| `telecom:validate` | Phase 5 base telecom API |
| `telecom:validate:phase6` … `phase20` | Incremental phase regression chain |
| `telecom:validate:remediation` | Remediation + phase20 regression + build/lint |
| `telecom:openapi` | Export OpenAPI spec |
| `tls:validate` | Certificate presence and validity |

Phase 20 validator recursively runs phase 19 → … → phase 5.

---

## Unit and integration tests

```bash
npm test
# or
npx nx run-many -t test --all
```

Jest configured for API packages. Test coverage is supplementary to static validators for RC1.

---

## Smoke tests (runtime)

Phase 20 smoke tests (`POST /api/v1/cutover/smoke-test`) verify:

- SIP registration configuration
- Health endpoints
- Telnyx webhook configuration
- TLS and secret presence
- Migration and backup markers

**Not verified:** Live RTP media, actual PSTN call completion.

After smoke tests pass, execute manual tests per [smoke-test-guide.md](../10-production/smoke-test-guide.md).

---

## Staging acceptance

Complete [RC1_CHECKLIST.md](../12-release/RC1_CHECKLIST.md) on staging environment including:

- Extension-to-extension call
- PSTN inbound/outbound
- WebRTC enroll and call
- Grandstream provisioning
- Queue/IVR APP_MEDIA path (if configured)

---

## Regression policy

Engineering freeze prohibits feature changes. Allowed RC1 changes:

- Release packaging and version alignment
- Documentation
- Build fixes (no behavior change)
- Verified production defect fixes only

Any telecom behavior change requires formal change control.

---

## Troubleshooting test failures

| Failure | Action |
|---------|--------|
| `npm run build` fails | Check `packages/config`, `packages/logger`, `packages/common` TypeScript errors |
| Remediation validator fails | Read FAIL line; check Kamailio cfg patterns, RBAC guards, frozen schema |
| Phase N regression fails | Run that phase script directly for isolated diagnosis |
| Lint warnings | Review `nx lint api` / `nx lint admin` output |

See [TROUBLESHOOTING.md](../10-production/TROUBLESHOOTING.md).

---

## Related documents

- [BUILD_VERIFICATION.md](../12-release/BUILD_VERIFICATION.md)
- [FINAL_QUALITY_GATE.md](../12-release/FINAL_QUALITY_GATE.md)
- [post-go-live-verification-guide.md](../10-production/post-go-live-verification-guide.md)
