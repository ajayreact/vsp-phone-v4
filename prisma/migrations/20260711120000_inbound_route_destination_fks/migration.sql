-- InboundRoute dedicated destination foreign keys for Tenant Portal V2 DID assignment
ALTER TABLE "inbound_routes" ADD COLUMN IF NOT EXISTS "destination_extension_id" UUID;
ALTER TABLE "inbound_routes" ADD COLUMN IF NOT EXISTS "destination_voicemail_id" UUID;
ALTER TABLE "inbound_routes" ADD COLUMN IF NOT EXISTS "destination_conference_id" UUID;

-- Backfill extension destinations from line mapping where possible
UPDATE "inbound_routes" ir
SET "destination_extension_id" = e.id
FROM "extensions" e
WHERE ir."destination_line_id" = e."line_id"
  AND ir."destination_type" IN ('LINE', 'EXTENSION')
  AND ir."destination_extension_id" IS NULL
  AND e."deleted_at" IS NULL;

-- Backfill voicemail/conference from legacy open_hours destination storage
UPDATE "inbound_routes"
SET "destination_voicemail_id" = "open_hours_destination_id"::uuid
WHERE "destination_type" = 'VOICEMAIL'
  AND "open_hours_destination_id" IS NOT NULL
  AND "destination_voicemail_id" IS NULL;

UPDATE "inbound_routes"
SET "destination_conference_id" = "open_hours_destination_id"::uuid
WHERE "destination_type" = 'CONFERENCE'
  AND "open_hours_destination_id" IS NOT NULL
  AND "destination_conference_id" IS NULL;
