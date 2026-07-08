import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/jwt.util';
import { SecurityAuditService } from '../../enterprise-security/audit/security-audit.service';
import { TelecomStructuredLoggerService } from '../../enterprise-observability/logging/telecom-structured-logger.service';
import { MigrationImportService } from '../import/migration-import.service';
import { MigrationValidationService } from '../validation/migration-validation.service';
import { MigrationVerificationService } from '../verification/migration-verification.service';
import { RollbackMetadataService } from '../rollback/rollback-metadata.service';
import { MigrationSafetyService } from './migration-safety.service';
import type { MigrationImportDto } from '../dto/migration.dto';
import type { MigrationBatchRecord } from '../types/migration.types';

/** Phase 19 — migration workflow orchestration. */
@Injectable()
export class MigrationOrchestratorService {
  private readonly logger = new Logger(MigrationOrchestratorService.name);

  constructor(
    private readonly safety: MigrationSafetyService,
    private readonly validation: MigrationValidationService,
    private readonly imports: MigrationImportService,
    private readonly verification: MigrationVerificationService,
    private readonly rollback: RollbackMetadataService,
    private readonly audit: SecurityAuditService,
    private readonly structuredLog: TelecomStructuredLoggerService,
  ) {}

  async validatePlatform(batchId: string | undefined, user: JwtPayload) {
    await this.safety.assertReadyForMigration();

    const result: Record<string, unknown> = {
      ts: new Date().toISOString(),
      phase: 'phase19-enterprise-migration-toolkit',
      platformReady: true,
      actorUserId: user.sub,
    };

    if (batchId) {
      const batch = await this.imports.getBatch(batchId);
      if (!batch) throw new NotFoundException('Migration batch not found');
      result.batch = batch;
    }

    this.auditEvent(user, 'migration.validate', { batchId });
    return result;
  }

  async dryRun(dto: MigrationImportDto, user: JwtPayload): Promise<MigrationBatchRecord> {
    await this.safety.assertReadyForMigration();
    const record = await this.imports.execute({
      payload: { ...dto, dryRun: true },
      dryRun: true,
      actorUserId: user.sub,
      tenantId: user.tenantId,
    });
    this.auditEvent(user, 'migration.dry_run', { batchId: record.batchId, passed: record.validation.passed });
    this.logEvent(user, 'migration.dry_run', record.batchId);
    return record;
  }

  async import(dto: MigrationImportDto, user: JwtPayload): Promise<MigrationBatchRecord> {
    await this.safety.assertReadyForMigration();
    const dryRun = dto.dryRun === true;
    const record = await this.imports.execute({
      payload: dto,
      dryRun,
      actorUserId: user.sub,
      tenantId: user.tenantId,
    });

    if (!dryRun && record.validation.passed) {
      await this.verification.verify(record.batchId);
    }

    this.auditEvent(user, dryRun ? 'migration.import.dry' : 'migration.import', {
      batchId: record.batchId,
      passed: record.validation.passed,
    });
    this.logEvent(user, 'migration.import', record.batchId);
    return record;
  }

  async getVerification(batchId: string) {
    return this.verification.verify(batchId);
  }

  async getRollbackMetadata(batchId: string) {
    return this.rollback.generate(batchId);
  }

  private auditEvent(user: JwtPayload, action: string, detail: Record<string, unknown>): void {
    this.audit.adminAction({
      tenantId: user.tenantId,
      userId: user.sub,
      action,
      resourceType: 'migration_batch',
      resourceId: String(detail.batchId ?? ''),
      detail,
    });
  }

  private logEvent(user: JwtPayload, event: string, batchId: string): void {
    this.structuredLog.log({
      event,
      category: 'provisioning',
      severity: 'info',
      tenantId: user.tenantId,
      userId: user.sub,
      detail: { batchId },
    });
  }
}
