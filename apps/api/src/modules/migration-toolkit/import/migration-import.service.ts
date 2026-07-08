import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { MappingEngineService } from '../mapping/mapping-engine.service';
import { MigrationDatabaseImportService } from './migration-database-import.service';
import { MigrationValidationService } from '../validation/migration-validation.service';
import type { MigrationBatchRecord, MigrationPayload } from '../types/migration.types';
import { MIGRATION_REDIS_KEYS as KEYS } from '../types/migration.types';

/** Phase 19 — import to Redis staging (no Prisma writes; duplicate prevention). */
@Injectable()
export class MigrationImportService {
  private readonly logger = new Logger(MigrationImportService.name);

  constructor(
    private readonly redis: TelecomRedisService,
    private readonly validation: MigrationValidationService,
    private readonly mapping: MappingEngineService,
    private readonly databaseImport: MigrationDatabaseImportService,
  ) {}

  async execute(params: {
    payload: MigrationPayload;
    dryRun: boolean;
    actorUserId: string;
    tenantId?: string;
  }): Promise<MigrationBatchRecord> {
    const batchId = randomUUID();
    const validation = this.validation.validate(params.payload);
    const mappingReport = this.mapping.buildReport(params.payload);

    if (!validation.passed) {
      const failedRecord: MigrationBatchRecord = {
        batchId,
        label: params.payload.batchLabel,
        status: 'failed',
        dryRun: params.dryRun,
        createdAt: new Date().toISOString(),
        actorUserId: params.actorUserId,
        tenantId: params.tenantId,
        validation,
        mappingReport,
      };
      await this.saveBatch(failedRecord);
      return failedRecord;
    }

    if (!params.dryRun) {
      await this.assertNoDuplicates(params.payload);
    }

    const importSummary = this.summarizeImport(params.payload, params.dryRun);

    const record: MigrationBatchRecord = {
      batchId,
      label: params.payload.batchLabel,
      status: params.dryRun ? 'dry_run' : 'imported',
      dryRun: params.dryRun,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      actorUserId: params.actorUserId,
      tenantId: params.tenantId,
      validation,
      mappingReport,
      importSummary,
    };

    if (!params.dryRun) {
      await this.acquireLocks(params.payload, batchId);
    }

    if (params.payload.productionImport === true && !params.dryRun) {
      const dbResult = await this.databaseImport.importToDatabase({
        payload: params.payload,
        actorUserId: params.actorUserId,
        tenantId: params.tenantId,
      });
      record.importSummary = {
        ...(record.importSummary ?? { imported: 0, skipped: 0, unsupported: 0, byType: {} }),
        imported: (record.importSummary?.imported ?? 0) + dbResult.imported,
        byType: { ...(record.importSummary?.byType ?? {}), ...dbResult.byType },
      };
      if (dbResult.errors.length) {
        record.validation.warnings.push(
          ...dbResult.errors.map((message) => ({
            severity: 'warning' as const,
            code: 'PRODUCTION_IMPORT_PARTIAL',
            entityType: 'tenant' as const,
            message,
          })),
        );
      }
    }

    await this.saveBatch(record);
    this.logger.log(JSON.stringify({ event: 'migration.import.complete', batchId, dryRun: params.dryRun }));
    return record;
  }

  async getBatch(batchId: string): Promise<MigrationBatchRecord | null> {
    const raw = await this.redis.get(KEYS.batch(batchId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MigrationBatchRecord;
    } catch {
      return null;
    }
  }

  async updateBatch(record: MigrationBatchRecord): Promise<void> {
    await this.saveBatch(record);
  }

  private async saveBatch(record: MigrationBatchRecord): Promise<void> {
    await this.redis.setex(KEYS.batch(record.batchId), 86400 * 7, JSON.stringify(record));
    await this.redis.lpushUnbounded(KEYS.batchIndex, record.batchId);
    await this.redis.ltrim(KEYS.batchIndex, 0, 499);
  }

  private summarizeImport(payload: MigrationPayload, dryRun: boolean) {
    const byType: Record<string, number> = {};
    let imported = 0;
    let unsupported = 0;
    for (const [type, rows] of Object.entries(payload.data)) {
      if (!rows || !Array.isArray(rows)) continue;
      byType[type] = rows.length;
      imported += rows.length;
      unsupported += rows.filter((r) => r.unsupported === true).length;
    }
    return {
      imported: dryRun ? 0 : imported,
      skipped: dryRun ? imported : 0,
      unsupported,
      byType,
    };
  }

  private async assertNoDuplicates(payload: MigrationPayload): Promise<void> {
    for (const [type, rows] of Object.entries(payload.data)) {
      if (!rows || !Array.isArray(rows)) continue;
      for (const row of rows) {
        const legacyId = String(row.legacyId ?? row.id ?? '');
        if (!legacyId) continue;
        const lockKey = KEYS.importLock(`${type}:${legacyId}`);
        const existing = await this.redis.get(lockKey);
        if (existing) {
          throw new ConflictException(`Duplicate import: ${type}/${legacyId} already imported in batch ${existing}`);
        }
      }
    }
  }

  private async acquireLocks(payload: MigrationPayload, batchId: string): Promise<void> {
    for (const [type, rows] of Object.entries(payload.data)) {
      if (!rows || !Array.isArray(rows)) continue;
      for (const row of rows) {
        const legacyId = String(row.legacyId ?? row.id ?? '');
        if (!legacyId) continue;
        await this.redis.setex(KEYS.importLock(`${type}:${legacyId}`), 86400 * 30, batchId);
      }
    }
  }
}
