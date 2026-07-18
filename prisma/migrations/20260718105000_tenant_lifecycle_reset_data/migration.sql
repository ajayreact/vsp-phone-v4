-- Migration B — schema + data that uses new enum values (runs after A is committed).
-- Idempotent: IF NOT EXISTS + guarded UPDATEs. Does not delete or truncate data.

ALTER TABLE "phone_numbers" ADD COLUMN IF NOT EXISTS "available" BOOLEAN NOT NULL DEFAULT true;

-- Soft-deleted tenants → DELETED status (only when not already DELETED).
UPDATE "tenants"
SET "status" = 'DELETED'
WHERE "deleted_at" IS NOT NULL
  AND "status"::text <> 'DELETED';

-- Numbers bound to a line are not inventory-available.
UPDATE "phone_numbers"
SET "available" = false
WHERE "line_id" IS NOT NULL
  AND "deleted_at" IS NULL
  AND "available" = true;
