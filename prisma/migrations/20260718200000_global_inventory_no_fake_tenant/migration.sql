-- RC1: Global Inventory via nullable owner_tenant_id (no Platform Inventory tenant).
-- One platform-level Telnyx carrier (carriers.tenant_id NULL).

-- ---------------------------------------------------------------------------
-- Phone numbers: add owner_tenant_id, make tenant_id nullable
-- ---------------------------------------------------------------------------
ALTER TABLE "phone_numbers" ADD COLUMN IF NOT EXISTS "owner_tenant_id" UUID;

ALTER TABLE "phone_numbers" DROP CONSTRAINT IF EXISTS "phone_numbers_tenant_id_number_key";
ALTER TABLE "phone_numbers" DROP CONSTRAINT IF EXISTS "phone_numbers_tenant_id_fkey";

ALTER TABLE "phone_numbers" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- Seed owner from current tenant for non-inventory rows (inventory slug handled below).
UPDATE "phone_numbers" pn
SET "owner_tenant_id" = pn."tenant_id"
WHERE pn."owner_tenant_id" IS NULL
  AND pn."tenant_id" IS NOT NULL
  AND pn."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tenants" t
    WHERE t."id" = pn."tenant_id"
      AND t."slug" IN ('platform-inventory', 'inventory')
  );

-- Move inventory-tenant DIDs into Global Inventory (NULL owner + NULL tenant).
UPDATE "phone_numbers" pn
SET
  "owner_tenant_id" = NULL,
  "tenant_id" = NULL,
  "site_id" = NULL,
  "line_id" = NULL,
  "available" = true
FROM "tenants" t
WHERE pn."tenant_id" = t."id"
  AND t."slug" IN ('platform-inventory', 'inventory')
  AND pn."deleted_at" IS NULL;

ALTER TABLE "phone_numbers"
  ADD CONSTRAINT "phone_numbers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "phone_numbers"
  ADD CONSTRAINT "phone_numbers_owner_tenant_id_fkey"
  FOREIGN KEY ("owner_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "phone_numbers_owner_tenant_id_idx" ON "phone_numbers"("owner_tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "phone_numbers_number_active_uidx"
  ON "phone_numbers"("number") WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------
-- Carriers: nullable tenant_id + collapse Telnyx to one platform carrier
-- ---------------------------------------------------------------------------
ALTER TABLE "carriers" DROP CONSTRAINT IF EXISTS "carriers_tenant_id_code_key";
ALTER TABLE "carriers" DROP CONSTRAINT IF EXISTS "carriers_tenant_id_fkey";

ALTER TABLE "carriers" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- Prefer existing inventory-tenant Telnyx as the platform carrier; else oldest Telnyx.
WITH pick AS (
  SELECT c."id"
  FROM "carriers" c
  LEFT JOIN "tenants" t ON t."id" = c."tenant_id"
  WHERE c."deleted_at" IS NULL
    AND c."carrier_type" = 'TELNYX'
  ORDER BY
    CASE WHEN t."slug" IN ('platform-inventory', 'inventory') THEN 0 ELSE 1 END,
    c."created_at" ASC
  LIMIT 1
)
UPDATE "carriers" c
SET "tenant_id" = NULL,
    "name" = 'Telnyx',
    "code" = 'telnyx'
FROM pick
WHERE c."id" = pick."id";

-- Re-point phone numbers and soft-delete duplicate Telnyx carriers.
WITH platform AS (
  SELECT c."id"
  FROM "carriers" c
  WHERE c."deleted_at" IS NULL
    AND c."carrier_type" = 'TELNYX'
    AND c."tenant_id" IS NULL
  ORDER BY c."created_at" ASC
  LIMIT 1
)
UPDATE "phone_numbers" pn
SET "carrier_id" = platform."id"
FROM platform
WHERE pn."carrier_id" IS NOT NULL
  AND pn."carrier_id" IN (
    SELECT c."id" FROM "carriers" c
    WHERE c."carrier_type" = 'TELNYX' AND c."deleted_at" IS NULL AND c."tenant_id" IS NOT NULL
  );

WITH platform AS (
  SELECT c."id"
  FROM "carriers" c
  WHERE c."deleted_at" IS NULL
    AND c."carrier_type" = 'TELNYX'
    AND c."tenant_id" IS NULL
  ORDER BY c."created_at" ASC
  LIMIT 1
)
UPDATE "carriers" c
SET "deleted_at" = NOW()
FROM platform
WHERE c."carrier_type" = 'TELNYX'
  AND c."deleted_at" IS NULL
  AND c."id" <> platform."id";

-- If no Telnyx carrier existed, create the platform one.
INSERT INTO "carriers" (
  "id", "public_id", "tenant_id", "name", "code", "carrier_type", "status",
  "configuration", "version", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'carrier-telnyx-platform-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  NULL,
  'Telnyx',
  'telnyx',
  'TELNYX',
  'ACTIVE',
  '{}'::jsonb,
  1,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "carriers"
  WHERE "carrier_type" = 'TELNYX' AND "tenant_id" IS NULL AND "deleted_at" IS NULL
);

ALTER TABLE "carriers"
  ADD CONSTRAINT "carriers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "carriers_platform_code_uidx"
  ON "carriers"("code") WHERE "tenant_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "carriers_tenant_code_uidx"
  ON "carriers"("tenant_id", "code") WHERE "tenant_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "carriers_carrier_type_idx" ON "carriers"("carrier_type");

-- ---------------------------------------------------------------------------
-- Soft-delete Platform Inventory tenant + clear settings pointer
-- ---------------------------------------------------------------------------
UPDATE "platform_settings"
SET "inventory_tenant_id" = NULL
WHERE "inventory_tenant_id" IS NOT NULL;

UPDATE "tenants"
SET
  "deleted_at" = COALESCE("deleted_at", NOW()),
  "status" = 'DELETED',
  "version" = "version" + 1
WHERE "slug" IN ('platform-inventory', 'inventory')
  AND "deleted_at" IS NULL;
