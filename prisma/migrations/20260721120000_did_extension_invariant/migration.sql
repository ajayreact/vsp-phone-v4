-- RC1 product model: One DID ↔ One Extension (permanent invariant).
-- Re-link orphan phone_numbers to their last known line from number_assignments.
-- Extension/line soft-delete restore and full binding is completed by API
-- ensureTenantDidExtensionPairs() on Extension Hub load.

UPDATE phone_numbers pn
SET line_id = sub.line_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (na.phone_number_id)
    na.phone_number_id,
    na.line_id
  FROM number_assignments na
  JOIN phone_numbers p ON p.id = na.phone_number_id AND p.deleted_at IS NULL
  WHERE na.line_id IS NOT NULL
    AND na.deleted_at IS NULL
    AND p.line_id IS NULL
  ORDER BY na.phone_number_id, na.effective_from DESC
) sub
WHERE pn.id = sub.phone_number_id
  AND pn.deleted_at IS NULL
  AND pn.line_id IS NULL;
