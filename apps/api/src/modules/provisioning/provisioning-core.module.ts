import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExtensionProvisionCoreModule } from '../tenant-portal/extension-provision-core.module';
import { TelecomModule } from '../telecom/module';
import { ProvisioningAuditService } from './audit/provisioning-audit.service';
import { ConfigGeneratorService } from './generator/config-generator.service';
import { DeviceEnrollmentService } from './enrollment/device-enrollment.service';
import { FirmwareCatalogService } from './firmware/firmware-catalog.service';
import { ProvisioningOrchestratorService } from './orchestrator/provisioning-orchestrator.service';
import { ProvisioningRedisService } from './redis/provisioning-redis.service';
import { ArtifactStoreService } from './store/artifact-store.service';
import { TemplateEngineService } from './templates/template-engine.service';
import { ProvisioningVaultService } from './vault/provisioning-vault.service';
import { DeviceProvisioningCleanupService } from './cleanup/device-provisioning-cleanup.service';
import { ProvMacAuthGuard } from './guards/prov-mac-auth.guard';

/** Shared provisioning providers (no HTTP controllers). */
@Module({
  imports: [TelecomModule, AuthModule, ExtensionProvisionCoreModule],
  providers: [
    DeviceProvisioningCleanupService,
    ProvisioningRedisService,
    ProvisioningVaultService,
    ArtifactStoreService,
    TemplateEngineService,
    FirmwareCatalogService,
    ConfigGeneratorService,
    ProvisioningAuditService,
    DeviceEnrollmentService,
    ProvisioningOrchestratorService,
    ProvMacAuthGuard,
  ],
  exports: [
    DeviceProvisioningCleanupService,
    ProvisioningRedisService,
    ProvisioningVaultService,
    ArtifactStoreService,
    TemplateEngineService,
    FirmwareCatalogService,
    ConfigGeneratorService,
    ProvisioningAuditService,
    DeviceEnrollmentService,
    ProvisioningOrchestratorService,
    ProvMacAuthGuard,
  ],
})
export class ProvisioningCoreModule {}
