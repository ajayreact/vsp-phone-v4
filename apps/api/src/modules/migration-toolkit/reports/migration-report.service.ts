import { Injectable, NotFoundException } from '@nestjs/common';
import { MigrationImportService } from '../import/migration-import.service';
import type { MigrationBatchRecord } from '../types/migration.types';

/** Phase 19 — migration reports in JSON and CSV. */
@Injectable()
export class MigrationReportService {
  constructor(private readonly imports: MigrationImportService) {}

  async exportJson(batchId: string): Promise<MigrationBatchRecord & { format: 'json' }> {
    const batch = await this.imports.getBatch(batchId);
    if (!batch) throw new NotFoundException('Migration batch not found');
    return { ...batch, format: 'json' };
  }

  async exportCsv(batchId: string): Promise<{ format: 'csv'; content: string }> {
    const batch = await this.imports.getBatch(batchId);
    if (!batch) throw new NotFoundException('Migration batch not found');

    const lines: string[] = [
      'section,severity,code,entityType,entityId,message',
    ];

    for (const err of batch.validation.errors) {
      lines.push(this.csvRow('error', err));
    }
    for (const warn of batch.validation.warnings) {
      lines.push(this.csvRow('warning', warn));
    }

    if (batch.importSummary) {
      lines.push(`summary,info,IMPORTED,,,${batch.importSummary.imported}`);
      lines.push(`summary,info,SKIPPED,,,${batch.importSummary.skipped}`);
      lines.push(`summary,info,UNSUPPORTED,,,${batch.importSummary.unsupported}`);
    }

    if (batch.verification) {
      for (const [name, check] of Object.entries(batch.verification.checks)) {
        lines.push(`verification,${check.pass ? 'info' : 'error'},${name},,,expected=${check.expected};actual=${check.actual}`);
      }
    }

    return { format: 'csv', content: lines.join('\n') };
  }

  private csvRow(section: string, issue: { severity: string; code: string; entityType: string; entityId?: string; message: string }): string {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      section,
      issue.severity,
      issue.code,
      issue.entityType,
      issue.entityId ?? '',
      esc(issue.message),
    ].join(',');
  }
}
