-- Extension-first: optional user on Line, display metadata on Extension
ALTER TABLE "lines" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "extensions" ADD COLUMN "description" TEXT;
ALTER TABLE "extensions" ADD COLUMN "department_id" UUID;

ALTER TABLE "extensions"
  ADD CONSTRAINT "extensions_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "extensions_department_id_idx" ON "extensions"("department_id");
