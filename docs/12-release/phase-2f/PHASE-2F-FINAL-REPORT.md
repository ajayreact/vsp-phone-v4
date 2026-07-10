# Phase 2F — Final Report

## Issues Fixed

1. Live calls RBAC — Ops users with `ops:live_calls:read` no longer receive 403.
2. Tenant extensions API — Page uses `/v1/tenant/extensions` with create slide-over.
3. Dead create buttons — Queues, IVR, ring groups, voicemail, routing wired to POST endpoints.
4. Read-only modules — Devices, provisioning, trunks no longer show disabled create buttons.
5. Portal route isolation — Middleware blocks cross-portal navigation by URL.
6. SIP trace search — NOC trace tab Search triggers query with empty-state guidance.
7. Error messages — API client parses NestJS JSON error bodies.
8. Module placeholder scaffold — Removed dead Refresh button and demo copy.

## Issues Remaining

| Priority | Item |
|----------|------|
| P2 | Tenant organization PATCH API |
| P2 | Manual device enroll API (zero-touch only) |
| P2 | Trunk create (carrier-managed) |
| P2 | Softphone transfer/conference |
| P3 | Super-admin tenant picker on ops/NOC |
| P3 | Tenant user create from tenant portal |

## Technical Debt

Shared create-form consolidation; NOC JSON panels could become structured viewers.

## Production Risks

Cross-portal bookmarks mitigated by middleware. Line-dependent creates show explicit empty-line messaging.

## Recommendations

Deploy three portal builds with distinct `NEXT_PUBLIC_PORTAL`. Run smoke checklist before RC1 promotion.
