# VSP Phone v4 — Production Smoke Test Checklist

## Authentication

- [ ] Login at admin.* / app.* / tenant.*
- [ ] Invalid credentials show error
- [ ] Cross-portal URL redirects to dashboard

## Platform Admin

- [ ] Dashboard, tenants onboard, users create, roles, API keys, audit, Telnyx, settings

## Tenant PBX

- [ ] Extensions, queues, IVR, ring groups, voicemail, routing create + list
- [ ] Marketplace search + number request
- [ ] CDR + recordings

## Supervisor & NOC

- [ ] Supervisor dashboard, wallboard, live calls
- [ ] NOC 12 tabs, SIP trace search, alerts
- [ ] Live calls page for ops user

## Builds

```bash
npx nx run api:build
npx nx run admin:build
```
