import { Module } from '@nestjs/common';
import { EnterpriseHaCoreModule } from '../enterprise-ha/enterprise-ha-core.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { BackupReadinessService } from './backups/backup-readiness.service';
import { ConfigExportService } from './configuration/config-export.service';
import { ProductionConfigValidatorService } from './configuration/production-config-validator.service';
import { ProductionController } from './controllers/production.controller';
import { CicdReadinessService } from './deployment/cicd-readiness.service';
import { DeploymentReadinessService } from './deployment/deployment-readiness.service';
import { EnvironmentProfileService } from './environment/environment-profile.service';
import { ReleaseInfoService } from './releases/release-info.service';
import { RestoreValidationService } from './restore/restore-validation.service';
import { StartupValidationService } from './validation/startup-validation.service';
import { ProductionReadinessService } from './readiness/production-readiness.service';
import { ProductionPlatformService } from './services/production-platform.service';

@Module({
  imports: [TelecomInfrastructureModule, EnterpriseObservabilityCoreModule, EnterpriseHaCoreModule],
  controllers: [ProductionController],
  providers: [
    EnvironmentProfileService,
    ProductionConfigValidatorService,
    ConfigExportService,
    ReleaseInfoService,
    DeploymentReadinessService,
    BackupReadinessService,
    RestoreValidationService,
    CicdReadinessService,
    StartupValidationService,
    ProductionReadinessService,
    ProductionPlatformService,
  ],
  exports: [
    EnvironmentProfileService,
    ProductionConfigValidatorService,
    DeploymentReadinessService,
    ReleaseInfoService,
    ProductionPlatformService,
    BackupReadinessService,
    RestoreValidationService,
  ],
})
export class ProductionPlatformCoreModule {}
