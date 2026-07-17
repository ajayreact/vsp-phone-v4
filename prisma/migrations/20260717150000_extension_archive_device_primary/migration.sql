-- Extension Workspace Polish (RC1 next phase)
-- Additive columns only — no data migration, no breaking changes.

-- Extension.archivedAt: distinct from deletedAt. Archived extensions stay
-- visible/browsable/restorable in the Extensions workspace (unlike delete).
ALTER TABLE "extensions" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "extensions_tenant_id_archived_at_idx"
  ON "extensions" ("tenant_id", "archived_at");

-- Device.isPrimary: at most one primary device per line, enforced in
-- application logic (see TenantDevicesService.makePrimary).
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "devices_tenant_id_line_id_is_primary_idx"
  ON "devices" ("tenant_id", "line_id", "is_primary");
