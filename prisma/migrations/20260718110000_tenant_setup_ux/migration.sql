-- RC1 Tenant Setup UX: Developer Mode + Company Profile brand/caller fields
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "developer_mode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "brand_primary" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "brand_secondary" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "default_caller_id" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "emergency_number" TEXT;
