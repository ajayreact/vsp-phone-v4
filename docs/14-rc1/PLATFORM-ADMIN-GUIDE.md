# Platform Admin Guide (RC1)

| Field | Value |
|-------|-------|
| **Portal** | `admin.<domain>` |
| **Audience** | Platform operators, super admins |

## Navigation (Phase 3A)

| Area | Routes | Purpose |
|------|--------|---------|
| Dashboard | `/dashboard` | Operational metrics, quick actions |
| Tenants | `/tenants`, `/tenants/[id]` | Tenant list and 8-tab detail workspace |
| DID Inventory | `/did-inventory` | Platform number inventory (read-only assign) |
| System | `/system-health`, `/audit-logs`, etc. | Infrastructure and audit |
| Provisioning | `/provisioning` | Enterprise provisioning wizard |

## Daily operations

### Monitor platform health

- Dashboard operational sections (tenants, DIDs, provisioning activity)
- System Health (`/system-health`) for API, Postgres, Redis, Kamailio, RTPengine

### Manage tenants

1. **Tenants** → select tenant → **Tenant Detail**
2. Tabs: Overview, Extensions, Phone Numbers, Devices, Users, Billing, Audit, Settings
3. Lifecycle badges show tenant status (view only in RC1 — no disable/archive/delete)

### Provision numbers

See [PROVISIONING-GUIDE.md](./PROVISIONING-GUIDE.md).

### DID Inventory

- View all Telnyx numbers, status, assigned tenant
- Filter by available / assigned / region
- Select numbers → launch provisioning workspace (no inline assign)

## Permissions

| Action | Permission |
|--------|------------|
| View tenants | `PLATFORM_TENANTS_READ` |
| Onboard tenant | `PLATFORM_TENANTS_WRITE` |
| View DID inventory | `PLATFORM_TELNYX_READ` |
| Provision (bulk assign) | `PLATFORM_TELNYX_WRITE` |
| Full cross-tenant extension list | `PLATFORM_SUPER_ADMIN` |

## Portal isolation

- Platform routes blocked on tenant hostname (middleware redirect)
- API enforces RBAC; UI hides nav items without permission
- Direct URL to `/tenants/[id]` may render shell; API calls fail without permission

## Troubleshooting

| Issue | Check |
|-------|-------|
| Empty tenant list | JWT valid; `PLATFORM_TENANTS_READ` assigned |
| DID inventory empty | Telnyx sync; `PLATFORM_TELNYX_READ` |
| Provisioning fails | Browser console `[Provision]` logs; API 403/500 |
| Tenant detail stale after provision | Hard refresh; cache invalidates on provision complete |

## Related

- Administrator guide (legacy): `docs/12-release/phase-2f/ADMINISTRATOR-GUIDE.md`
- NOC ops: `docs/10-production/noc-operations-guide.md`
