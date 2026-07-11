-- Tenant onboarding metadata: org profile, site details, admin profile, subscription limits

ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "business_email" TEXT,
  ADD COLUMN IF NOT EXISTS "business_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "website" TEXT,
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "company_size" TEXT,
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT;

ALTER TABLE "sites"
  ADD COLUMN IF NOT EXISTS "postal_code" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "business_hours" TEXT;

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "mobile" TEXT,
  ADD COLUMN IF NOT EXISTS "job_title" TEXT,
  ADD COLUMN IF NOT EXISTS "department" TEXT;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "max_users" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_extensions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_numbers" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "storage_limit_gb" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recording_retention_days" INTEGER NOT NULL DEFAULT 90;
