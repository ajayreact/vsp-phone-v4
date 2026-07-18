import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarrierAdminModule } from '../carrier-admin/carrier-admin.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { ProductionPlatformCoreModule } from '../production-platform/production-platform-core.module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { PlatformApiKeysController } from './controllers/platform-api-keys.controller';
import { PlatformAuditController } from './controllers/platform-audit.controller';
import { PlatformBillingController } from './controllers/platform-billing.controller';
import { PlatformCarriersController } from './controllers/platform-carriers.controller';
import { PlatformDashboardController } from './controllers/platform-dashboard.controller';
import { PlatformOrganizationController } from './controllers/platform-organization.controller';
import { PlatformProvisioningSettingsController } from './controllers/platform-provisioning-settings.controller';
import { PlatformRolesController } from './controllers/platform-roles.controller';
import { PlatformSearchController } from './controllers/platform-search.controller';
import { PlatformSettingsController } from './controllers/platform-settings.controller';
import { PlatformSystemHealthController } from './controllers/platform-system-health.controller';
import {
  PlatformAssetsController,
  PlatformTenantsController,
} from './controllers/platform-tenants.controller';
import { PlatformUsersController } from './controllers/platform-users.controller';
import { PlatformDevToolsController } from './controllers/platform-dev-tools.controller';
import { PlatformApiKeysService } from './services/platform-api-keys.service';
import { TenantDevToolsService } from './services/tenant-dev-tools.service';
import { PlatformAssetStorageService } from './services/platform-asset-storage.service';
import { PlatformAuditService } from './services/platform-audit.service';
import { PlatformBillingService } from './services/platform-billing.service';
import { PlatformCarriersService } from './services/platform-carriers.service';
import { PlatformDashboardService } from './services/platform-dashboard.service';
import { PlatformOrganizationService } from './services/platform-organization.service';
import { PlatformProvisioningSettingsService } from './services/platform-provisioning-settings.service';
import { PlatformRolesService } from './services/platform-roles.service';
import { PlatformSearchService } from './services/platform-search.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { PlatformSystemHealthService } from './services/platform-system-health.service';
import { PlatformTenantsService } from './services/platform-tenants.service';
import { PlatformUsersService } from './services/platform-users.service';
import { TenantResetService } from './services/tenant-reset.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    EnterpriseObservabilityCoreModule,
    ProductionPlatformCoreModule,
    CarrierAdminModule,
    RecordingCoreModule,
  ],
  controllers: [
    PlatformDashboardController,
    PlatformSystemHealthController,
    PlatformTenantsController,
    PlatformAssetsController,
    PlatformBillingController,
    PlatformRolesController,
    PlatformCarriersController,
    PlatformAuditController,
    PlatformSettingsController,
    PlatformProvisioningSettingsController,
    PlatformUsersController,
    PlatformApiKeysController,
    PlatformSearchController,
    PlatformOrganizationController,
    PlatformDevToolsController,
  ],
  providers: [
    PlatformDashboardService,
    PlatformSystemHealthService,
    PlatformTenantsService,
    TenantResetService,
    TenantDevToolsService,
    PlatformAssetStorageService,
    PlatformBillingService,
    PlatformRolesService,
    PlatformCarriersService,
    PlatformAuditService,
    PlatformSettingsService,
    PlatformProvisioningSettingsService,
    PlatformUsersService,
    PlatformApiKeysService,
    PlatformSearchService,
    PlatformOrganizationService,
  ],
  exports: [
    PlatformDashboardService,
    PlatformSystemHealthService,
    PlatformTenantsService,
    TenantResetService,
    PlatformBillingService,
    PlatformRolesService,
    PlatformCarriersService,
    PlatformAuditService,
    PlatformSettingsService,
    PlatformProvisioningSettingsService,
    PlatformUsersService,
    PlatformApiKeysService,
    PlatformSearchService,
    PlatformOrganizationService,
  ],
})
export class PlatformAdminModule {}
