# VSP Phone v4 — Enterprise Admin Portal Architecture

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Stack** | Next.js 16 App Router · React 19 · TypeScript |
| **Scope** | Commercial multi-tenant PBX administration (post-RC1) |
| **Reference products** | 3CX Admin · RingCentral Admin · Zoom Phone Admin |

---

## 1. Executive summary

The Enterprise Admin Portal is a **tenant-scoped SaaS console** for managing organizations, users, telephony resources, call routing, media services, and platform operations. It sits beside the existing Browser Softphone (`/softphone`) and consumes the NestJS API (`/api/v1/*`).

**Design principles**

- **Modular routes** — one App Router segment per domain module
- **RBAC-first** — navigation and pages gated by permission keys from `GET /v1/auth/me`
- **API-ready / stub-aware** — modules with live APIs show real data; others show structured placeholders with integration status
- **BFF for ops plane** — service-auth endpoints (observability, HA, Kamailio) proxied via Next.js Route Handlers, never exposing tokens to the browser
- **Preserve softphone** — WebRTC client remains at `/softphone`, linked from header

---

## 2. High-level architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Browser (admin.vspphone.com)                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js 16 Admin Portal (apps/admin)                     │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Auth Layer  │  │ Portal Shell │  │ Module Pages     │  │  │
│  │  │ JWT+Refresh │  │ Nav·Header   │  │ Dashboard·Users… │  │  │
│  │  └──────┬──────┘  └──────────────┘  └────────┬─────────┘  │  │
│  │         │                                      │            │  │
│  │  ┌──────▼──────────────────────────────────────▼────────┐  │  │
│  │  │ lib/api/*  ·  lib/rbac/*  ·  lib/navigation/*        │  │  │
│  │  └──────┬───────────────────────────────┬───────────────┘  │  │
│  └─────────┼───────────────────────────────┼──────────────────┘  │
└────────────┼───────────────────────────────┼─────────────────────┘
             │ Bearer JWT                    │ Server-only BFF
             ▼                               ▼
┌────────────────────────┐    ┌──────────────────────────────────┐
│  NestJS API :3000       │    │  Next.js Route Handlers          │
│  /api/v1/auth/*        │    │  /api/bff/observability/*        │
│  /api/v1/provisioning  │    │  /api/bff/ha/*                   │
│  /api/v1/presence      │    │  (X-VSP-Service-Auth server-side)│
│  /api/v1/recordings    │    └──────────────────────────────────┘
│  (future CRUD modules) │
└────────────────────────┘
             │
             ▼
      PostgreSQL · Redis · Kamailio · RTPengine
```

---

## 3. Directory structure

```text
apps/admin/
├── docs/
│   └── ARCHITECTURE.md          ← this document
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root: ThemeProvider, AuthProvider, fonts
│   │   ├── page.tsx             # Redirect → /dashboard or /login
│   │   ├── globals.css          # Design tokens + Tailwind
│   │   ├── (auth)/
│   │   │   ├── layout.tsx       # Centered auth layout
│   │   │   └── login/page.tsx
│   │   ├── (portal)/
│   │   │   ├── layout.tsx       # PortalShell (sidebar + header)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── organization/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── roles/page.tsx
│   │   │   ├── permissions/page.tsx
│   │   │   ├── extensions/page.tsx
│   │   │   ├── devices/page.tsx
│   │   │   ├── sip-accounts/page.tsx
│   │   │   ├── dids/page.tsx
│   │   │   ├── trunks/page.tsx
│   │   │   ├── call-routing/page.tsx
│   │   │   ├── ring-groups/page.tsx
│   │   │   ├── queues/page.tsx
│   │   │   ├── ivr/page.tsx
│   │   │   ├── voicemail/page.tsx
│   │   │   ├── conferences/page.tsx
│   │   │   ├── call-recordings/page.tsx
│   │   │   ├── cdr/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── provisioning/page.tsx
│   │   │   ├── carriers/page.tsx
│   │   │   ├── kamailio/page.tsx
│   │   │   ├── rtpengine/page.tsx
│   │   │   ├── redis/page.tsx
│   │   │   ├── postgresql/page.tsx
│   │   │   ├── system-health/page.tsx
│   │   │   ├── audit-logs/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── softphone/           # Existing WebRTC client (unchanged route)
│   │   └── api/
│   │       ├── health/route.ts
│   │       └── bff/             # Service-auth proxies
│   ├── components/
│   │   ├── layout/              # PortalShell, Sidebar, Header, Breadcrumbs…
│   │   ├── ui/                  # Button, Card, Badge, Table, Input…
│   │   ├── data/                # DataTable, StatCard, EmptyState, StatusBadge
│   │   ├── auth/                # LoginForm, PermissionGate, RequireAuth
│   │   └── modules/             # Module-specific composites (DashboardStats…)
│   ├── lib/
│   │   ├── api/                 # Typed API clients per domain
│   │   ├── auth/                # session, context, hooks
│   │   ├── rbac/                # permission helpers, route guards
│   │   ├── navigation/          # nav config, breadcrumbs
│   │   ├── theme/               # dark/light mode
│   │   └── utils/               # cn(), formatters
│   └── types/
│       ├── auth.ts
│       ├── navigation.ts
│       └── api.ts
```

---

## 4. Route map

| Module | Path | Nav group | Min permission |
|--------|------|-----------|----------------|
| Dashboard | `/dashboard` | Overview | `tenant:user` |
| Organization | `/organization` | Organization | `tenant:admin` |
| Users | `/users` | Organization | `tenant:admin` |
| Roles | `/roles` | Organization | `tenant:admin` |
| Permissions | `/permissions` | Organization | `tenant:admin` |
| Extensions | `/extensions` | Telephony | `tenant:admin` |
| Devices | `/devices` | Telephony | `provisioning:admin` |
| SIP Accounts | `/sip-accounts` | Telephony | `tenant:admin` |
| DIDs | `/dids` | Telephony | `tenant:admin` |
| Trunks | `/trunks` | Telephony | `tenant:admin` |
| Call Routing | `/call-routing` | Routing | `tenant:admin` |
| Ring Groups | `/ring-groups` | Routing | `tenant:admin` |
| Queues | `/queues` | Routing | `tenant:admin` |
| IVR | `/ivr` | Routing | `tenant:admin` |
| Voicemail | `/voicemail` | Routing | `tenant:admin` |
| Conferences | `/conferences` | Routing | `tenant:admin` |
| Call Recordings | `/call-recordings` | Analytics | `recordings:read` |
| CDR | `/cdr` | Analytics | `tenant:admin` |
| Reports | `/reports` | Analytics | `tenant:admin` |
| Provisioning | `/provisioning` | Operations | `provisioning:admin` |
| Carriers | `/carriers` | Operations | `tenant:admin` |
| Kamailio | `/kamailio` | Infrastructure | `platform:super_admin` |
| RTPengine | `/rtpengine` | Infrastructure | `platform:super_admin` |
| Redis | `/redis` | Infrastructure | `platform:super_admin` |
| PostgreSQL | `/postgresql` | Infrastructure | `platform:super_admin` |
| System Health | `/system-health` | Infrastructure | `platform:super_admin` |
| Audit Logs | `/audit-logs` | Security | `tenant:admin` |
| Settings | `/settings` | System | `tenant:admin` |
| Browser Softphone | `/softphone` | (header link) | authenticated |

---

## 5. Authentication & session

### Flow

1. User submits credentials on `/login`
2. `POST /api/v1/auth/login` → access token + identity
3. `POST /api/v1/auth/refresh-token/issue` → refresh token (httpOnly cookie via Route Handler)
4. `GET /api/v1/auth/me` → profile + permissions + tenant context
5. Client stores access token in memory (sessionStorage for MVP; migrate to memory-only + BFF cookies in hardening phase)
6. Silent refresh via `POST /api/v1/auth/refresh` before expiry

### Auth context shape

```typescript
type AuthSession = {
  userId: string;
  tenantId: string;
  email: string;
  permissions: string[];
  roles: { id: string; name: string }[];
  tenant: { id: string; name: string; slug: string } | null;
};
```

---

## 6. RBAC model

### Existing API permission keys

| Key | Scope |
|-----|-------|
| `platform:super_admin` | Platform ops, migration, cutover, infra modules |
| `tenant:admin` | Tenant administration |
| `tenant:user` | Standard tenant user (dashboard read) |
| `provisioning:admin` | Device enroll/assign/reprovision |
| `recordings:read` | Call recording list/playback |
| `presence:read` / `presence:write` | Line presence |

### Frontend enforcement

- **`PermissionGate`** — hides UI when permission missing
- **`usePermission(key)`** — hook for conditional actions
- **`RequireAuth`** — redirects unauthenticated users to `/login`
- **Nav filtering** — `navigation.ts` filters items by `permissions` array
- **Super-admin bypass** — `platform:super_admin` grants all nav items

### Planned permission keys (API Phase 21+)

Documented for module pages; backend modules to implement:

`users:read`, `users:write`, `extensions:read`, `extensions:write`, `dids:read`, `queues:read`, `ivr:read`, `audit:read`, etc.

---

## 7. API integration matrix

| Module | API status | Endpoint(s) |
|--------|------------|-------------|
| Auth | **Live** | `/v1/auth/login`, `/me`, `/refresh`, `/logout` |
| Provisioning | **Live** | `/v1/provisioning/devices/*` |
| Presence | **Live** | `/v1/presence/lines/*` |
| Call Recordings | **Live** | `/v1/recordings` |
| WebRTC Softphone | **Live** | `/v1/telecom/webrtc/enroll` |
| System Health | **BFF** | Proxy → `/v1/observability/dashboard`, `/v1/production/readiness` |
| Kamailio / HA | **BFF** | Proxy → `/v1/ha/*` |
| Users, Extensions, DIDs, Queues, IVR… | **Planned** | Prisma models exist; NestJS modules are placeholders |

Module pages for **Planned** APIs render:

- Module header + breadcrumbs
- Integration status badge (`API Planned`)
- Entity schema summary from Prisma
- Disabled action buttons with tooltip

---

## 8. UI shell specification

### Layout (1440px desktop reference)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Header: Logo · Tenant selector · Search · Notifications · User   │
├────────────┬─────────────────────────────────────────────────────┤
│ Sidebar    │ Breadcrumbs                                         │
│ (240px)    ├─────────────────────────────────────────────────────┤
│            │ Page title + actions                                │
│ Nav groups │                                                     │
│            │ Module content                                      │
│            │                                                     │
│ Collapse ◀ │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

### Responsive breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `< 768px` | Sidebar → drawer overlay; stacked header |
| `768–1024px` | Collapsed sidebar (icons only) |
| `≥ 1024px` | Full sidebar |

### Theme

- CSS custom properties for light/dark
- `ThemeProvider` + `localStorage` preference + `prefers-color-scheme` fallback
- Enterprise palette: neutral slate base, blue accent, semantic status colors

---

## 9. Reusable component library

### Layout (`components/layout/`)

| Component | Purpose |
|-----------|---------|
| `PortalShell` | Sidebar + header + main content area |
| `Sidebar` | Grouped navigation with collapse |
| `Header` | Top bar with tenant, search, notifications, user menu |
| `Breadcrumbs` | Auto-generated from route + nav config |
| `PageHeader` | Title, description, primary/secondary actions |
| `PageContainer` | Max-width content wrapper with padding |

### UI primitives (`components/ui/`)

| Component | Purpose |
|-----------|---------|
| `Button` | Primary, secondary, ghost, danger variants |
| `Card` | Surface container with optional header/footer |
| `Badge` | Status and count indicators |
| `Input`, `Select`, `Checkbox` | Form controls |
| `Table` | Sortable data table base |
| `Dropdown`, `Avatar`, `Tooltip` | Interactive elements |
| `Skeleton` | Loading placeholders |

### Data (`components/data/`)

| Component | Purpose |
|-----------|---------|
| `DataTable` | Paginated table with empty/loading states |
| `StatCard` | KPI metric tile |
| `EmptyState` | No-data illustration + CTA |
| `IntegrationBadge` | Live / BFF / Planned API status |
| `PermissionDenied` | 403 module fallback |

### Auth (`components/auth/`)

| Component | Purpose |
|-----------|---------|
| `AuthProvider` | Session context |
| `RequireAuth` | Route guard |
| `PermissionGate` | Conditional render by permission |
| `LoginForm` | Credential form |

---

## 10. Module implementation order

| Phase | Modules | Rationale |
|-------|---------|-----------|
| **A — Foundation** | Auth, Shell, Theme, RBAC | Required for all pages |
| **B — Overview** | Dashboard | Landing experience |
| **C — Live APIs** | Provisioning, Call Recordings, System Health | Real data integration |
| **D — Organization** | Users, Roles, Permissions, Organization | Core admin CRUD (API build-out) |
| **E — Telephony** | Extensions, Devices, SIP Accounts, DIDs, Trunks | Inventory management |
| **F — Routing** | Call Routing, Ring Groups, Queues, IVR, Voicemail, Conferences | PBX apps |
| **G — Analytics** | CDR, Reports, Audit Logs | Reporting |
| **H — Infrastructure** | Kamailio, RTPengine, Redis, PostgreSQL, Carriers | Platform ops |
| **I — System** | Settings | Tenant configuration |

---

## 11. Security considerations

- Never expose `TELECOM_SERVICE_AUTH_TOKEN` to client bundles
- BFF routes validate JWT + `platform:super_admin` before proxying ops APIs
- CSRF: SameSite cookies for refresh tokens when migrated
- Content Security Policy headers via nginx (existing)
- Log redaction: no tokens in client console logs

---

## 12. Softphone coexistence

- `/softphone` remains a standalone route outside `(portal)` layout (full-screen phone UI)
- Header includes "Softphone" quick-launch link
- Shared auth: softphone uses same JWT from `AuthProvider`

---

## 13. Testing strategy

| Layer | Tool |
|-------|------|
| Component | React Testing Library (future) |
| E2E | Playwright (`apps/admin-e2e`) — login, nav, permission gates |
| API contract | OpenAPI types from `npm run telecom:openapi` |

---

## 14. Deployment

- Same Docker image (`Dockerfile.admin`) — no architecture change
- Env: `NEXT_PUBLIC_API_URL=https://api.vspphone.com/api`
- BFF env (server-only): `TELECOM_SERVICE_AUTH_TOKEN`, `API_INTERNAL_URL`

---

*Document maintained by VSP Platform Engineering — Admin Portal Phase 21*
