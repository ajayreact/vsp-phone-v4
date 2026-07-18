-- RC1: canonicalize RBAC permission keys + grant platform.devtools to Super Admin only.

-- Rename legacy aliases when present (idempotent).
UPDATE permissions
SET key = 'tenant.users.manage',
    description = 'tenant.users.manage',
    updated_at = NOW()
WHERE key = 'tenant:users:write'
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM permissions p2
    WHERE p2.tenant_id = permissions.tenant_id
      AND p2.key = 'tenant.users.manage'
      AND p2.deleted_at IS NULL
  );

UPDATE permissions
SET key = 'tenant.extensions.manage',
    description = 'tenant.extensions.manage',
    updated_at = NOW()
WHERE key = 'tenant:extensions:write'
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM permissions p2
    WHERE p2.tenant_id = permissions.tenant_id
      AND p2.key = 'tenant.extensions.manage'
      AND p2.deleted_at IS NULL
  );

UPDATE permissions
SET key = 'platform.tenants.reset',
    description = 'platform.tenants.reset',
    updated_at = NOW()
WHERE key = 'platform:tenants:reset'
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM permissions p2
    WHERE p2.tenant_id = permissions.tenant_id
      AND p2.key = 'platform.tenants.reset'
      AND p2.deleted_at IS NULL
  );

UPDATE permissions
SET key = 'platform.tenants.delete',
    description = 'platform.tenants.delete',
    updated_at = NOW()
WHERE key = 'platform:tenants:delete'
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM permissions p2
    WHERE p2.tenant_id = permissions.tenant_id
      AND p2.key = 'platform.tenants.delete'
      AND p2.deleted_at IS NULL
  );

-- Soft-delete leftover alias rows if canonical already exists.
UPDATE permissions
SET deleted_at = NOW(), updated_at = NOW()
WHERE deleted_at IS NULL
  AND key IN (
    'tenant:users:write',
    'tenant:extensions:write',
    'platform:tenants:reset',
    'platform:tenants:delete'
  );

-- Ensure tenant manage keys exist and are granted to Tenant Admin.
WITH keys AS (
  SELECT unnest(ARRAY['tenant.users.manage', 'tenant.extensions.manage']) AS key
),
tenants_missing AS (
  SELECT t.id AS tenant_id, k.key
  FROM tenants t
  CROSS JOIN keys k
  WHERE t.deleted_at IS NULL
    AND t.slug NOT IN ('platform', 'inventory', 'platform-inventory', 'vsp-internal')
    AND NOT EXISTS (
      SELECT 1 FROM permissions p
      WHERE p.tenant_id = t.id
        AND p.key = k.key
        AND p.deleted_at IS NULL
    )
),
inserted_perms AS (
  INSERT INTO permissions (id, public_id, tenant_id, key, description, version, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    'perm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    tenant_id,
    key,
    key,
    1,
    NOW(),
    NOW()
  FROM tenants_missing
  RETURNING id, tenant_id, key
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

-- Ensure platform.devtools exists on platform tenant and is granted only to Super Admin.
WITH platform_tenant AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE slug = 'platform'
    AND deleted_at IS NULL
  LIMIT 1
),
inserted AS (
  INSERT INTO permissions (id, public_id, tenant_id, key, description, version, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    'perm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    pt.tenant_id,
    'platform.devtools',
    'platform.devtools',
    1,
    NOW(),
    NOW()
  FROM platform_tenant pt
  WHERE NOT EXISTS (
    SELECT 1
    FROM permissions p
    WHERE p.tenant_id = pt.tenant_id
      AND p.key = 'platform.devtools'
      AND p.deleted_at IS NULL
  )
  RETURNING id, tenant_id
),
perm AS (
  SELECT id, tenant_id FROM inserted
  UNION ALL
  SELECT p.id, p.tenant_id
  FROM permissions p
  JOIN platform_tenant pt ON pt.tenant_id = p.tenant_id
  WHERE p.key = 'platform.devtools'
    AND p.deleted_at IS NULL
)
INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  perm.tenant_id,
  r.id,
  perm.id,
  NOW(),
  NOW()
FROM perm
JOIN roles r
  ON r.tenant_id = perm.tenant_id
 AND r.name = 'Super Admin'
 AND r.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.tenant_id = perm.tenant_id
    AND rp.role_id = r.id
    AND rp.permission_id = perm.id
    AND rp.deleted_at IS NULL
);

-- Also ensure reset/delete keys exist on platform tenant for Super Admin.
WITH platform_tenant AS (
  SELECT id AS tenant_id
  FROM tenants
  WHERE slug = 'platform'
    AND deleted_at IS NULL
  LIMIT 1
),
keys AS (
  SELECT unnest(ARRAY['platform.tenants.reset', 'platform.tenants.delete']) AS key
),
inserted AS (
  INSERT INTO permissions (id, public_id, tenant_id, key, description, version, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    'perm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    pt.tenant_id,
    k.key,
    k.key,
    1,
    NOW(),
    NOW()
  FROM platform_tenant pt
  CROSS JOIN keys k
  WHERE NOT EXISTS (
    SELECT 1 FROM permissions p
    WHERE p.tenant_id = pt.tenant_id
      AND p.key = k.key
      AND p.deleted_at IS NULL
  )
  RETURNING id, tenant_id, key
),
perm AS (
  SELECT id, tenant_id FROM inserted
  UNION ALL
  SELECT p.id, p.tenant_id
  FROM permissions p
  JOIN platform_tenant pt ON pt.tenant_id = p.tenant_id
  JOIN keys k ON k.key = p.key
  WHERE p.deleted_at IS NULL
)
INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  perm.tenant_id,
  r.id,
  perm.id,
  NOW(),
  NOW()
FROM perm
JOIN roles r
  ON r.tenant_id = perm.tenant_id
 AND r.name = 'Super Admin'
 AND r.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.tenant_id = perm.tenant_id
    AND rp.role_id = r.id
    AND rp.permission_id = perm.id
    AND rp.deleted_at IS NULL
);
