-- =============================================================================
-- VSP Phone v4 — Telephony data integrity verification (RC1)
-- Schema: prisma/schema.prisma
-- Run read-only against PostgreSQL. All checks exclude soft-deleted rows unless noted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SUMMARY DASHBOARD
-- ---------------------------------------------------------------------------
WITH
orphan_dids AS (
  SELECT pn.id
  FROM phone_numbers pn
  LEFT JOIN tenants t ON t.id = pn.tenant_id
  WHERE pn.deleted_at IS NULL
    AND (
      pn.line_id IS NOT NULL
      OR pn.status = 'ACTIVE'
      OR EXISTS (
        SELECT 1 FROM number_assignments na
        WHERE na.phone_number_id = pn.id
          AND na.deleted_at IS NULL
          AND na.effective_to IS NULL
      )
    )
    AND (t.id IS NULL OR t.deleted_at IS NOT NULL)
),
orphan_extensions AS (
  SELECT e.id
  FROM extensions e
  LEFT JOIN lines l ON l.id = e.line_id AND l.deleted_at IS NULL
  LEFT JOIN tenants t ON t.id = e.tenant_id AND t.deleted_at IS NULL
  WHERE e.deleted_at IS NULL
    AND (l.id IS NULL OR t.id IS NULL OR e.tenant_id <> l.tenant_id)
),
orphan_lines AS (
  SELECT l.id
  FROM lines l
  LEFT JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL
  LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
  WHERE l.deleted_at IS NULL
    AND (t.id IS NULL OR e.id IS NULL)
),
orphan_inbound_routes AS (
  SELECT ir.id
  FROM inbound_routes ir
  LEFT JOIN tenants t ON t.id = ir.tenant_id AND t.deleted_at IS NULL
  WHERE ir.deleted_at IS NULL
    AND t.id IS NULL
),
dup_extensions AS (
  SELECT tenant_id, "extension"
  FROM extensions
  WHERE deleted_at IS NULL
  GROUP BY tenant_id, "extension"
  HAVING COUNT(*) > 1
),
dup_did_numbers AS (
  SELECT tenant_id, number
  FROM phone_numbers
  WHERE deleted_at IS NULL
  GROUP BY tenant_id, number
  HAVING COUNT(*) > 1
),
chain_breaks AS (
  SELECT pn.id
  FROM phone_numbers pn
  JOIN lines l ON l.id = pn.line_id AND l.deleted_at IS NULL
  LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
  WHERE pn.deleted_at IS NULL
    AND pn.line_id IS NOT NULL
    AND (pn.tenant_id <> l.tenant_id OR e.id IS NULL OR e.tenant_id <> pn.tenant_id)
)
SELECT 'orphan_dids' AS check_name, COUNT(*)::bigint AS issue_count FROM orphan_dids
UNION ALL SELECT 'orphan_extensions', COUNT(*) FROM orphan_extensions
UNION ALL SELECT 'orphan_lines', COUNT(*) FROM orphan_lines
UNION ALL SELECT 'orphan_inbound_routes', COUNT(*) FROM orphan_inbound_routes
UNION ALL SELECT 'duplicate_extension_nums', COUNT(*) FROM dup_extensions
UNION ALL SELECT 'duplicate_did_numbers', COUNT(*) FROM dup_did_numbers
UNION ALL SELECT 'did_line_extension_chain_breaks', COUNT(*) FROM chain_breaks
ORDER BY check_name;

-- ---------------------------------------------------------------------------
-- DETAIL: DID → tenant → line → extension → inbound route chain breaks
-- ---------------------------------------------------------------------------
SELECT
  pn.number AS did,
  pn.tenant_id AS phone_tenant_id,
  l.tenant_id AS line_tenant_id,
  e."extension" AS extension_number,
  e.tenant_id AS extension_tenant_id,
  ir.id AS inbound_route_id,
  ir.tenant_id AS route_tenant_id,
  CASE
    WHEN pn.tenant_id <> l.tenant_id THEN 'phone_ne_line'
    WHEN e.id IS NULL THEN 'line_missing_extension'
    WHEN e.tenant_id <> pn.tenant_id THEN 'extension_ne_phone'
    WHEN ir.id IS NOT NULL AND ir.tenant_id <> pn.tenant_id THEN 'route_ne_phone'
    ELSE 'ok'
  END AS chain_issue
FROM phone_numbers pn
JOIN lines l ON l.id = pn.line_id AND l.deleted_at IS NULL
LEFT JOIN extensions e ON e.line_id = l.id AND e.deleted_at IS NULL
LEFT JOIN inbound_routes ir ON ir.phone_number_id = pn.id AND ir.deleted_at IS NULL
WHERE pn.deleted_at IS NULL
  AND pn.line_id IS NOT NULL
  AND (
    pn.tenant_id <> l.tenant_id
    OR e.id IS NULL
    OR e.tenant_id <> pn.tenant_id
    OR (ir.id IS NOT NULL AND ir.tenant_id <> pn.tenant_id)
  );

-- ---------------------------------------------------------------------------
-- DETAIL: Multiple open assignments per DID
-- ---------------------------------------------------------------------------
SELECT
  na.phone_number_id,
  pn.number,
  COUNT(*) AS open_assignment_count
FROM number_assignments na
JOIN phone_numbers pn ON pn.id = na.phone_number_id AND pn.deleted_at IS NULL
WHERE na.deleted_at IS NULL
  AND na.effective_to IS NULL
GROUP BY na.phone_number_id, pn.number
HAVING COUNT(*) > 1;
