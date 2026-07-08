import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseHaCoreModule } from '../enterprise-ha/enterprise-ha-core.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { MigrationToolkitCoreModule } from '../migration-toolkit/migration-toolkit-core.module';
import { ProductionPlatformCoreModule } from '../production-platform/production-platform-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { CutoverStateService } from './cutover/cutover-state.service';
import { ChecklistEngineService } from './cutover/checklist-engine.service';
import { CutoverController } from './controllers/cutover.controller';
import { CutoverMonitoringService } from './monitoring/cutover-monitoring.service';
import { CutoverReportService } from './reports/cutover-report.service';
import { RollbackPlanService } from './rollback/rollback-plan.service';
import { RunbookCatalogService } from './runbooks/runbook-catalog.service';
import { CutoverOrchestratorService } from './services/cutover-orchestrator.service';
import { SmokeTestService } from './smoke-tests/smoke-test.service';
import { CutoverReadinessService } from './validation/cutover-readiness.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    AuthModule,
    EnterpriseSecurityCoreModule,
    EnterpriseObservabilityCoreModule,
    EnterpriseHaCoreModule,
    ProductionPlatformCoreModule,
    MigrationToolkitCoreModule,
  ],
  controllers: [CutoverController],
  providers: [
    RunbookCatalogService,
    CutoverStateService,
    ChecklistEngineService,
    CutoverReadinessService,
    SmokeTestService,
    CutoverMonitoringService,
    RollbackPlanService,
    CutoverReportService,
    CutoverOrchestratorService,
  ],
  exports: [CutoverOrchestratorService, CutoverReadinessService, CutoverMonitoringService],
})
export class ProductionCutoverCoreModule {}
