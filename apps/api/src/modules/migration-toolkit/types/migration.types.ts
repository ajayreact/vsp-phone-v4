/** Phase 19 — migration batch record types (in-memory / Redis staging; no Prisma writes). */
export type MigrationEntityType =
  | 'tenant'
  | 'user'
  | 'extension'
  | 'did'
  | 'sip_account'
  | 'device'
  | 'queue'
  | 'ivr'
  | 'ring_group'
  | 'hunt_group'
  | 'feature_code'
  | 'provisioning_profile';

export interface MigrationIssue {
  severity: 'error' | 'warning';
  code: string;
  entityType: MigrationEntityType;
  entityId?: string;
  message: string;
}

export interface MigrationMappings {
  tenants?: Record<string, string>;
  extensions?: Record<string, string>;
  dids?: Record<string, string>;
  devices?: Record<string, string>;
  featureCodes?: Record<string, string>;
}

export interface MigrationPayload {
  batchLabel?: string;
  dryRun?: boolean;
  productionImport?: boolean;
  productionImportConfirm?: string;
  mappings?: MigrationMappings;
  data: Partial<Record<MigrationEntityType, Record<string, unknown>[]>>;
}

export type MigrationBatchStatus =
  | 'validated'
  | 'dry_run'
  | 'imported'
  | 'verified'
  | 'failed'
  | 'incomplete';

export interface MigrationBatchRecord {
  batchId: string;
  label?: string;
  status: MigrationBatchStatus;
  dryRun: boolean;
  createdAt: string;
  completedAt?: string;
  actorUserId?: string;
  tenantId?: string;
  validation: {
    errors: MigrationIssue[];
    warnings: MigrationIssue[];
    passed: boolean;
  };
  mappingReport?: Record<string, unknown>;
  importSummary?: {
    imported: number;
    skipped: number;
    unsupported: number;
    byType: Record<string, number>;
  };
  verification?: {
    passed: boolean;
    checks: Record<string, { expected: number; actual: number; pass: boolean }>;
  };
  rollback?: {
    batchId: string;
    importTimestamp: string;
    verificationStatus: string;
    reversible: false;
    note: string;
  };
}

export const MIGRATION_SUPER_ADMIN_PERMISSION = 'platform:super_admin';

export const MIGRATION_REDIS_KEYS = {
  batch: (batchId: string) => `vsp:migration:batch:${batchId}`,
  batchIndex: 'vsp:migration:batch:index',
  importLock: (legacyId: string) => `vsp:migration:lock:${legacyId}`,
} as const;
