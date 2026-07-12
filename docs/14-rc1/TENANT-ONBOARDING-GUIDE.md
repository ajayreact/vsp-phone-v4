# Tenant Onboarding Guide (RC1)

| Field | Value |
|-------|-------|
| **Portal** | Platform Admin |
| **Permission** | `PLATFORM_TENANTS_WRITE` or `PLATFORM_SUPER_ADMIN` |

## New tenant onboarding

### Option A: Onboarding wizard

1. Platform Admin → **Tenants** → **Onboard Tenant**
2. Complete organization details, admin user, slug
3. API: `POST /v1/platform/tenants/onboard`
4. Verify tenant appears in tenant list with `active` status

### Option B: Manual + provision

1. Create tenant via onboard API or admin UI
2. Navigate to `/provisioning?tenantId=<uuid>`
3. Select available DIDs and run provisioning wizard

## Post-onboarding checklist

- [ ] Tenant admin can log in at `tenant.<domain>/login`
- [ ] Extension Hub loads (`/people/extensions` or tenant v2 nav)
- [ ] At least one extension with assigned DID (if telephony required)
- [ ] Phone Setup / QR generation works for an extension
- [ ] Voicemail and call handling configurable

## Assigning phone numbers

Use the **Provisioning Wizard** (not DID Inventory assign UI — removed in Phase 3A).

Query params for deep link:

```
/provisioning?tenantId=<uuid>&selectedNumbers=+15551234567&startExtension=101
```

## Tenant admin first login

1. Provide tenant admin email and temporary password
2. Tenant admin logs in → Dashboard
3. Configure company profile under Organization
4. Provision desk phones via People → Devices or Extension Phone Setup

## Database verification

After onboarding + provisioning:

```bash
psql $DATABASE_URL -f scripts/platform/db-integrity-verification.sql
```

Expect zero rows in summary dashboard for critical checks.

## Related

- [PROVISIONING-GUIDE.md](./PROVISIONING-GUIDE.md)
- Legacy tenant guide: `docs/12-release/phase-2f/TENANT-GUIDE.md`
