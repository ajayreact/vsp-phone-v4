-- Tenant Lifecycle: DELETED status, in-tenant UNASSIGNED DIDs, available flag

DO $$ BEGIN
  ALTER TYPE "tenant_status" ADD VALUE 'DELETED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "phone_number_status" ADD VALUE 'UNASSIGNED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "phone_numbers" ADD COLUMN IF NOT EXISTS "available" BOOLEAN NOT NULL DEFAULT true;

UPDATE "tenants"
SET "status" = 'DELETED'
WHERE "deleted_at" IS NOT NULL AND "status"::text <> 'DELETED';

UPDATE "phone_numbers"
SET "available" = false
WHERE "line_id" IS NOT NULL AND "deleted_at" IS NULL;
