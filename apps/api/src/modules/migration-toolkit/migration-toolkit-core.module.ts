import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { ProductionPlatformCoreModule } from '../production-platform/production-platform-core.module';
import { EnterpriseHaCoreModule } from '../enterprise-ha/enterprise-ha-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { MigrationController } from './controllers/migration.controller';
import { MigrationExportService } from './export/migration-export.service';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { MigrationDatabaseImportService } from './import/migration-database-import.service';
import { MigrationImportService } from './import/migration-import.service';
import { MappingEngineService } from './mapping/mapping-engine.service';
import { MigrationReportService } from './reports/migration-report.service';
import { RollbackMetadataService } from './rollback/rollback-metadata.service';
import { MigrationOrchestratorService } from './services/migration-orchestrator.service';
import { MigrationSafetyService } from './services/migration-safety.service';
import { MigrationValidationService } from './validation/migration-validation.service';
import { MigrationVerificationService } from './verification/migration-verification.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    AuthModule,
    EnterpriseSecurityCoreModule,
    EnterpriseObservabilityCoreModule,
    EnterpriseHaCoreModule,
    ProductionPlatformCoreModule,
  ],
  controllers: [MigrationController],
  providers: [
    SuperAdminGuard,
    MigrationValidationService,
    MigrationImportService,
    MigrationDatabaseImportService,
    MigrationExportService,
    MappingEngineService,
    MigrationVerificationService,
    RollbackMetadataService,
    MigrationReportService,
    MigrationSafetyService,
    MigrationOrchestratorService,
  ],
  exports: [MigrationOrchestratorService, MigrationValidationService, MigrationExportService, MigrationImportService, RollbackMetadataService],
})
export class MigrationToolkitCoreModule {}
