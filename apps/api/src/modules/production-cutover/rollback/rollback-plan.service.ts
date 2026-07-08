import { Injectable } from '@nestjs/common';
import { RollbackMetadataService } from '../../migration-toolkit/rollback/rollback-metadata.service';
import { MigrationImportService } from '../../migration-toolkit/import/migration-import.service';
import { MIGRATION_REDIS_KEYS } from '../../migration-toolkit/types/migration.types';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { RunbookCatalogService } from '../runbooks/runbook-catalog.service';
import type { RollbackPlan } from '../types/cutover.types';

/** Phase 20 — rollback planning (non-destructive; no automatic rollback). */
@Injectable()
export class RollbackPlanService {
  constructor(
    private readonly rollbackMeta: RollbackMetadataService,
    private readonly migrationImports: MigrationImportService,
    private readonly redis: TelecomRedisService,
    private readonly catalog: RunbookCatalogService,
  ) {}

  async generate(batchId?: string): Promise<RollbackPlan> {
    const resolvedBatchId = batchId ?? (await this.latestBatchId());
    const migrationBatchReferences: string[] = [];
    const affectedComponents = [
      'Kamailio SIP routing',
      'Telnyx DID routing',
      'Grandstream provisioning',
      'Redis migration staging',
      'PostgreSQL tenant data (manual restore)',
    ];

    if (resolvedBatchId) {
      migrationBatchReferences.push(resolvedBatchId);
      try {
        await this.rollbackMeta.generate(resolvedBatchId);
      } catch {
        /* batch may not exist */
      }
    }

    const indexRaw = await this.redis.lrange(MIGRATION_REDIS_KEYS.batchIndex, 0, 9);
    for (const id of indexRaw) {
      if (!migrationBatchReferences.includes(id)) migrationBatchReferences.push(id);
    }

    const verificationRequirements = [
      'Legacy platform health endpoints green',
      'DID routing restored to legacy carrier config',
      'SIP registrations on legacy platform verified',
      'Customer notification sent',
      'Post-rollback smoke test on legacy platform',
      'Incident post-mortem scheduled',
    ];

    const checklist = this.catalog.getTemplate('rollback');
    const recordCount = resolvedBatchId
      ? (await this.migrationImports.getBatch(resolvedBatchId))?.importSummary?.byType
      : undefined;
    const entityCount = recordCount
      ? Object.values(recordCount).reduce((a, b) => a + b, 0)
      : 0;
    const estimatedDurationMinutes = Math.max(30, 15 + entityCount * 2);

    return {
      ts: new Date().toISOString(),
      batchId: resolvedBatchId,
      checklist,
      affectedComponents,
      migrationBatchReferences,
      verificationRequirements,
      estimatedDurationMinutes,
      note: 'Rollback plan only — destructive rollback is not performed automatically. Follow rollback runbook.',
    };
  }

  private async latestBatchId(): Promise<string | undefined> {
    const ids = await this.redis.lrange(MIGRATION_REDIS_KEYS.batchIndex, 0, 0);
    return ids[0];
  }
}
