# Carrier module (Phase 8)

Telnyx Carrier Adapter per ADR-010 / TEL-CAR-001.

- `TelnyxCarrierAdapter` — trunk select, health, webhook normalize  
- `CarrierService` — DID/CLI, Redis Telnyx corr, failover  
- Controllers — health, failover, `POST /api/v1/webhooks/telnyx`

Prisma: use existing `Carrier` + `PhoneNumber` only. No schema changes.
