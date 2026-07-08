import { Injectable, NotFoundException } from '@nestjs/common';
import { MigrationImportService } from '../import/migration-import.service';
import type { MigrationBatchRecord } from '../types/migration.types';

/** Phase 19 — rollback metadata generation (non-destructive). */
@Injectable()
export class RollbackMetadataService {
  constructor(private readonly imports: MigrationImportService) {}

  async generate(batchId: string): Promise<NonNullable<MigrationBatchRecord['rollback']>> {
    const batch = await this.imports.getBatch(batchId);
    if (!batch) throw new NotFoundException('Migration batch not found');

    const rollback = {
      batchId,
      importTimestamp: batch.completedAt ?? batch.createdAt,
      verificationStatus: batch.verification?.passed ? 'verified' : batch.status,
      reversible: false as const,
      note:
        'Rollback metadata only — destructive rollback is not performed by the toolkit. Use legacy platform restore procedures.',
      recordCounts: batch.importSummary?.byType ?? {},
      validationErrorCount: batch.validation.errors.length,
      warningCount: batch.validation.warnings.length,
    };

    batch.rollback = {
      batchId,
      importTimestamp: rollback.importTimestamp,
      verificationStatus: String(rollback.verificationStatus),
      reversible: false,
      note: rollback.note,
    };

    return rollback;
  }
}
