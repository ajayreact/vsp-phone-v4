# Recording Module

Call recording metadata pipeline (Phase 12 — ADR-029).

- Media: RTPengine → spool → MinIO/S3
- Metadata: Prisma `Recording` rows only
- Correlation: `platformUuid` + segmentId
