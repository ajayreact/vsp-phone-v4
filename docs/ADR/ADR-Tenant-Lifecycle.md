# ADR — Tenant Lifecycle (Reset PBX / Reset Tenant / Delete)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2026-07-18 |
| Updated | 2026-07-18 (RC1 Re-Onboarding UX) |
| Scope | Customer Pilot — Platform Admin tenant operations |

## Context

Operators need three **different** destructive operations. Naming “Factory Reset” implied the tenant was destroyed; it only prepares **re-onboarding** while keeping DID ownership.

## Decision

### Naming

| UI / docs | API | Confirm phrase |
|-----------|-----|----------------|
| **Reset PBX** | `POST …/reset-pbx` | `RESET PBX {{NAME}}` |
| **Reset Tenant (Re-Onboarding)** | `POST …/reset-tenant` (`/factory-reset` deprecated alias) | `RESET {{NAME}}` |
| **Delete Tenant** | `POST …/delete` | `DELETE {{NAME}}` |

### Tenant states

| Status | Meaning |
|--------|---------|
| `PENDING` | Onboarding incomplete (including post–Reset Tenant) |
| `ACTIVE` | Normal operation |
| `SUSPENDED` | Login/ops blocked; data retained |
| `INACTIVE` | Legacy inactive |
| `DELETED` | Soft-deleted; DIDs released to inventory |

### Operations

```text
ACTIVE ──Reset PBX──► ACTIVE
ACTIVE ──Reset Tenant──► PENDING (Tenant Setup Wizard)
PENDING ──Setup complete──► ACTIVE
ACTIVE|SUSPENDED ──Delete──► DELETED
```

#### 1. Reset PBX

Keeps users, org, roles, API keys, DID ownership, assignment, extension mapping, and Caller ID.
Wipes PBX operational data only (CDR, recordings, devices, SIP endpoints, queues, IVR, etc.).
**Never** mutates `PhoneNumber` (`lineId`, status, `available`). DID unassign belongs only to Reset Tenant.

#### 2. Reset Tenant (Re-Onboarding)

Keeps tenant id/slug, system roles/permissions, DID ownership (`ownerTenantId` / `tenantId`). Wipes users, custom roles, API keys, org/sites, PBX. DIDs stay on tenant (clears extension binding only — never Global Inventory). Status → `PENDING`. UI opens **Tenant Setup Wizard** (7 steps).

#### 3. Delete Tenant

Soft-delete only (`DELETED` + `deletedAt`). Disable users/API keys. Return DIDs to **Global Inventory** (`ownerTenantId` / `tenantId` NULL). Never hard-delete the tenant row.

### Onboarding / Setup Wizard

Steps: Company → Location → Administrator → Business → Extensions → Assign Existing DIDs → Review → Finish (`POST …/resume-onboard`).

### Tenant Setup Progress

Tenant dashboard shows checklist progress (company, admin, extensions, devices, numbers, business hours) with **Continue Setup**.

### Developer Mode

- Flag: `PlatformSettings.developerMode` (+ optional `NEXT_PUBLIC_DEVELOPER_MODE`)
- Permission: `platform.devtools` (Platform Super Admin only)
- Menu / routes / APIs: require **both** Platform Super Admin (via `platform.devtools`) **and** Developer Mode
- Tools: Seed/Generate/Clear/Reset Demo — each action appends Enterprise Audit and runs bulk/destructive work in one Prisma `$transaction`

### Canonical RBAC keys (RC1)

| Key | Purpose |
|-----|---------|
| `platform.devtools` | Developer Tools APIs |
| `platform.tenants.reset` | Reset PBX / Reset Tenant |
| `platform.tenants.delete` | Soft-delete tenant |
| `tenant.users.manage` | Tenant user administration |
| `tenant.extensions.manage` | Tenant extension administration |

### Non-goals

- Hard-delete of `tenants`
- Telnyx carrier release on Reset Tenant
- Tenant-self-service Reset Tenant / Delete in Customer Pilot

### Schema

- `TenantStatus.DELETED`
- `PhoneNumberStatus.UNASSIGNED`
- `PhoneNumber.available`
- `PlatformSettings.developerMode`
- Company profile extras: `brandPrimary`, `brandSecondary`, `defaultCallerId`, `emergencyNumber` on `TenantSettings`

### Protected tenants

Slugs `platform`, `inventory`, `platform-inventory`, `vsp-internal` cannot be reset or deleted (legacy inventory slugs are soft-deleted / excluded from Tenants UI).

### Global Inventory

Unassigned platform DIDs use `PhoneNumber.ownerTenantId IS NULL` and `tenantId IS NULL`. There is no Platform Inventory tenant.
