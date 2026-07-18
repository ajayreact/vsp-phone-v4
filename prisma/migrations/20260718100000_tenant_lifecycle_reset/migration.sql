-- Migration A — enum values only.
-- Must commit before any SQL uses 'DELETED' / 'UNASSIGNED' (PostgreSQL 55P04).
-- Idempotent: duplicate_object is ignored.

DO $$ BEGIN
  ALTER TYPE "tenant_status" ADD VALUE 'DELETED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "phone_number_status" ADD VALUE 'UNASSIGNED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
