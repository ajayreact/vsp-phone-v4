-- Production: One DID ↔ One Extension (via phone_numbers.line_id)
-- Soft-deleted rows may keep NULL line_id; active rows: at most one phone per line.

-- Clear line_id on soft-deleted phones so unique index can apply cleanly.
UPDATE phone_numbers
SET line_id = NULL
WHERE deleted_at IS NOT NULL AND line_id IS NOT NULL;

-- If a line has multiple active DIDs, keep the oldest and detach the rest.
WITH ranked AS (
  SELECT
    id,
    line_id,
    ROW_NUMBER() OVER (PARTITION BY line_id ORDER BY created_at ASC, id ASC) AS rn
  FROM phone_numbers
  WHERE deleted_at IS NULL AND line_id IS NOT NULL
)
UPDATE phone_numbers pn
SET line_id = NULL, updated_at = NOW()
FROM ranked r
WHERE pn.id = r.id AND r.rn > 1;

-- One active primary DID per extension line.
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_one_line_active_uidx
  ON phone_numbers (line_id)
  WHERE line_id IS NOT NULL AND deleted_at IS NULL;

-- Soft-delete duplicate inbound routes for the same DID (keep oldest).
WITH ranked_routes AS (
  SELECT
    id,
    phone_number_id,
    ROW_NUMBER() OVER (
      PARTITION BY phone_number_id
      ORDER BY priority ASC, created_at ASC, id ASC
    ) AS rn
  FROM inbound_routes
  WHERE deleted_at IS NULL AND phone_number_id IS NOT NULL
)
UPDATE inbound_routes ir
SET deleted_at = NOW(), enabled = false, updated_at = NOW()
FROM ranked_routes r
WHERE ir.id = r.id AND r.rn > 1;

-- One active inbound route per DID.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_routes_one_did_active_uidx
  ON inbound_routes (phone_number_id)
  WHERE phone_number_id IS NOT NULL AND deleted_at IS NULL;

-- Confirm extensions uniqueness (already in schema; recreate if missing).
CREATE UNIQUE INDEX IF NOT EXISTS extensions_tenant_id_extension_key
  ON extensions (tenant_id, extension);
