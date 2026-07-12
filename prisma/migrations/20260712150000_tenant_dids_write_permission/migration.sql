-- Grant tenant:dids:write to Tenant Admin on existing tenants (Extension-First DID routing).

WITH tenants_missing AS (
  SELECT t.id AS tenant_id
  FROM tenants t
  WHERE t.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM permissions p
      WHERE p.tenant_id = t.id
        AND p.key = 'tenant:dids:write'
        AND p.deleted_at IS NULL
    )
),
inserted_perms AS (
  INSERT INTO permissions (id, public_id, tenant_id, key, description, version, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    'perm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    tenant_id,
    'tenant:dids:write',
    'tenant:dids:write',
    1,
    NOW(),
    NOW()
  FROM tenants_missing
  RETURNING id, tenant_id
)
INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  ip.tenant_id,
  r.id,
  ip.id,
  NOW(),
  NOW()
FROM inserted_perms ip
JOIN roles r
  ON r.tenant_id = ip.tenant_id
 AND r.name = 'Tenant Admin'
 AND r.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.tenant_id = ip.tenant_id
    AND rp.role_id = r.id
    AND rp.permission_id = ip.id
    AND rp.deleted_at IS NULL
);
