-- Multi-device SIP: Line owns canonical SIPEndpoint; many Devices share it.

-- 1) Drop 1:1 Device ↔ SIPEndpoint uniqueness
DROP INDEX IF EXISTS "devices_sip_endpoint_id_key";

-- 2) Line.sip_endpoint_id (canonical owner)
ALTER TABLE "lines" ADD COLUMN IF NOT EXISTS "sip_endpoint_id" UUID;

-- 3) Non-unique index on devices.sip_endpoint_id
CREATE INDEX IF NOT EXISTS "devices_sip_endpoint_id_idx" ON "devices"("sip_endpoint_id");

-- 4) Backfill line.sip_endpoint_id from existing devices (one endpoint per line)
UPDATE "lines" AS l
SET "sip_endpoint_id" = d."sip_endpoint_id"
FROM (
  SELECT DISTINCT ON ("line_id") "line_id", "sip_endpoint_id"
  FROM "devices"
  WHERE "deleted_at" IS NULL
    AND "sip_endpoint_id" IS NOT NULL
    AND "line_id" IS NOT NULL
  ORDER BY "line_id", "created_at" ASC
) AS d
WHERE l."id" = d."line_id"
  AND l."sip_endpoint_id" IS NULL
  AND l."deleted_at" IS NULL;

-- 5) Unique + FK for line ownership
CREATE UNIQUE INDEX IF NOT EXISTS "lines_sip_endpoint_id_key" ON "lines"("sip_endpoint_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lines_sip_endpoint_id_fkey'
  ) THEN
    ALTER TABLE "lines"
      ADD CONSTRAINT "lines_sip_endpoint_id_fkey"
      FOREIGN KEY ("sip_endpoint_id") REFERENCES "sip_endpoints"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
