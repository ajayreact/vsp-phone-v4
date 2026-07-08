# VSP Phone v4 — Kamailio Architecture

| Field | Value |
|-------|-------|
| **Document ID** | TEL-KAM-001 |
| **Version** | 0.2.0 |
| **Status** | Superseded in depth by Sprint 4 design |
| **Last Updated** | 2026-07-08 |
| **Owner** | Architecture |
| **Location** | `docs/04-telecom/kamailio-architecture.md` |

---

## Status

Sprint 4 produced the full Kamailio Telecom Integration design:

**→ [Kamailio Telecom Integration Architecture](./kamailio-telecom-integration-architecture.md)** (`TEL-KAM-002`)

Approved decisions remain in [ADR-008](../ADR/ADR-008-kamailio-architecture.md).

This file retains a pointer for historical navigation. Prefer **TEL-KAM-002** for implementation planning.

---

## Quick pointers

| Topic | Where |
|-------|-------|
| Responsibilities | ADR-008 + TEL-KAM-002 §2 |
| platformUuid correlation | TEL-KAM-002 §14 |
| NestJS integration | TEL-KAM-002 §5–7, proposed ADR-024 |
| HA / dispatcher | TEL-KAM-002 §10 |
| Media / RTPengine | ADR-009 + TEL-KAM-002 §9 |

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| [TEL-KAM-002 Kamailio Telecom Integration](./kamailio-telecom-integration-architecture.md) | Sprint 4 authoritative design |
| [ADR-008](../ADR/ADR-008-kamailio-architecture.md) | Accepted Kamailio decisions |
| [ADR Index](../ADR/README.md) | Architecture decisions |
