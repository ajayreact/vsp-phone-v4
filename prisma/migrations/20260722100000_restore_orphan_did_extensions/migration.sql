-- Restore soft-deleted extension+line pairs for orphan DIDs (e.g. deleted Extension 102).
-- Complements API ensureTenantDidExtensionPairs(); safe to re-run (idempotent).

WITH orphan_phones AS (
  SELECT pn.id AS phone_id, pn.tenant_id
  FROM phone_numbers pn
  WHERE pn.deleted_at IS NULL
    AND (
      pn.line_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM extensions e
        WHERE e.tenant_id = pn.tenant_id
          AND e.line_id = pn.line_id
          AND e.deleted_at IS NULL
      )
    )
),
last_binding AS (
  SELECT DISTINCT ON (na.phone_number_id)
    na.phone_number_id,
    na.line_id,
    na.tenant_id
  FROM number_assignments na
  INNER JOIN orphan_phones op ON op.phone_id = na.phone_number_id
  WHERE na.line_id IS NOT NULL
    AND na.deleted_at IS NULL
  ORDER BY na.phone_number_id, na.effective_from DESC NULLS LAST
)
UPDATE lines l
SET
  deleted_at = NULL,
  deleted_by = NULL,
  status = 'ACTIVE',
  updated_at = NOW()
FROM last_binding lb
INNER JOIN extensions e ON e.line_id = lb.line_id AND e.tenant_id = lb.tenant_id
WHERE l.id = lb.line_id
  AND l.tenant_id = lb.tenant_id
  AND l.deleted_at IS NOT NULL;

WITH orphan_phones AS (
  SELECT pn.id AS phone_id, pn.tenant_id
  FROM phone_numbers pn
  WHERE pn.deleted_at IS NULL
    AND (
      pn.line_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM extensions e
        WHERE e.tenant_id = pn.tenant_id
          AND e.line_id = pn.line_id
          AND e.deleted_at IS NULL
      )
    )
),
last_binding AS (
  SELECT DISTINCT ON (na.phone_number_id)
    na.phone_number_id,
    na.line_id,
    na.tenant_id
  FROM number_assignments na
  INNER JOIN orphan_phones op ON op.phone_id = na.phone_number_id
  WHERE na.line_id IS NOT NULL
    AND na.deleted_at IS NULL
  ORDER BY na.phone_number_id, na.effective_from DESC NULLS LAST
)
UPDATE extensions e
SET
  deleted_at = NULL,
  deleted_by = NULL,
  archived_at = NULL,
  extension = CASE
    WHEN e.extension ~ '^\d{1,5}__del__[a-f0-9]{12}$' THEN substring(e.extension from '^(\d{1,5})__del__')
    ELSE e.extension
  END,
  updated_at = NOW()
FROM last_binding lb
WHERE e.line_id = lb.line_id
  AND e.tenant_id = lb.tenant_id
  AND e.deleted_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM extensions live
    WHERE live.tenant_id = e.tenant_id
      AND live.deleted_at IS NULL
      AND live.id <> e.id
      AND live.extension = CASE
        WHEN e.extension ~ '^\d{1,5}__del__[a-f0-9]{12}$' THEN substring(e.extension from '^(\d{1,5})__del__')
        ELSE e.extension
      END
  );

WITH orphan_phones AS (
  SELECT pn.id AS phone_id, pn.tenant_id
  FROM phone_numbers pn
  WHERE pn.deleted_at IS NULL
    AND (
      pn.line_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM extensions e
        WHERE e.tenant_id = pn.tenant_id
          AND e.line_id = pn.line_id
          AND e.deleted_at IS NULL
      )
    )
),
last_binding AS (
  SELECT DISTINCT ON (na.phone_number_id)
    na.phone_number_id,
    na.line_id,
    na.tenant_id
  FROM number_assignments na
  INNER JOIN orphan_phones op ON op.phone_id = na.phone_number_id
  WHERE na.line_id IS NOT NULL
    AND na.deleted_at IS NULL
  ORDER BY na.phone_number_id, na.effective_from DESC NULLS LAST
)
UPDATE phone_numbers pn
SET line_id = lb.line_id, updated_at = NOW()
FROM last_binding lb
WHERE pn.id = lb.phone_number_id
  AND pn.deleted_at IS NULL
  AND (
    pn.line_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM extensions e
      WHERE e.line_id = pn.line_id
        AND e.tenant_id = pn.tenant_id
        AND e.deleted_at IS NULL
    )
  );
