-- Release MAC inventory held by soft-deleted devices (legacy extension-delete path).
-- Idempotent: safe to re-run; only touches rows with deleted_at set and mac still present.

UPDATE "devices"
SET
  "mac_address" = NULL,
  "status" = 'INACTIVE',
  "provisioning_status" = 'FAILED',
  "updated_at" = NOW()
WHERE "deleted_at" IS NOT NULL
  AND "mac_address" IS NOT NULL;
