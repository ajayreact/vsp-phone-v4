-- Verify all onboarding fields persisted for a tenant.
-- Usage on EC2:
--   export TENANT_ID=<uuid>
--   docker compose exec -T postgres psql -U vsp -d vsp_phone -v tenant_id="$TENANT_ID" -f - <<'SQL'
--   (paste this file)
--   SQL

\set ON_ERROR_STOP on

SELECT
  CASE WHEN COUNT(*) = 1 THEN 'OK tenant' ELSE 'MISSING tenant' END AS tenant_check
FROM tenants t
WHERE t.id = :'tenant_id'::uuid AND t.deleted_at IS NULL;

SELECT
  CASE WHEN ts.business_email IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS business_email,
  CASE WHEN ts.business_phone IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS business_phone,
  CASE WHEN ts.website IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS website,
  CASE WHEN ts.industry IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS industry,
  CASE WHEN ts.company_size IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS company_size,
  CASE WHEN ts.logo_url IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS logo_url
FROM tenant_settings ts
WHERE ts.tenant_id = :'tenant_id'::uuid;

SELECT
  CASE WHEN s.postal_code IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS postal_code,
  CASE WHEN s.description IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS site_description,
  CASE WHEN s.business_hours IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS business_hours
FROM sites s
WHERE s.tenant_id = :'tenant_id'::uuid AND s.deleted_at IS NULL
LIMIT 1;

SELECT
  CASE WHEN up.mobile IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS admin_mobile,
  CASE WHEN up.job_title IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS job_title,
  CASE WHEN up.department IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS department
FROM user_profiles up
WHERE up.tenant_id = :'tenant_id'::uuid AND up.deleted_at IS NULL
LIMIT 1;

SELECT
  CASE WHEN sub.id IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS subscription,
  CASE WHEN sub.billing_cycle IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS billing_cycle,
  CASE WHEN sub.max_users > 0 THEN 'OK' ELSE 'MISSING' END AS max_users,
  CASE WHEN sub.max_extensions > 0 THEN 'OK' ELSE 'MISSING' END AS max_extensions,
  CASE WHEN sub.max_numbers > 0 THEN 'OK' ELSE 'MISSING' END AS max_numbers,
  CASE WHEN sub.storage_limit_gb > 0 THEN 'OK' ELSE 'MISSING' END AS storage_limit_gb,
  CASE WHEN sub.recording_retention_days > 0 THEN 'OK' ELSE 'MISSING' END AS recording_retention
FROM subscriptions sub
WHERE sub.tenant_id = :'tenant_id'::uuid;

SELECT
  CASE WHEN ba.id IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS billing_account
FROM billing_accounts ba
WHERE ba.tenant_id = :'tenant_id'::uuid;

SELECT COUNT(*) AS tenant_features
FROM tenant_features tf
WHERE tf.tenant_id = :'tenant_id'::uuid AND tf.deleted_at IS NULL;

SELECT COUNT(*) AS user_roles
FROM user_roles ur
WHERE ur.tenant_id = :'tenant_id'::uuid AND ur.deleted_at IS NULL;

SELECT COUNT(*) AS role_permissions
FROM role_permissions rp
JOIN user_roles ur ON ur.role_id = rp.role_id AND ur.tenant_id = :'tenant_id'::uuid
WHERE rp.deleted_at IS NULL;
