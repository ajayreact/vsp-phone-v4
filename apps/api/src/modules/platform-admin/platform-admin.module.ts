import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { PlatformAuditController } from './controllers/platform-audit.controller';
import { PlatformBillingController } from './controllers/platform-billing.controller';
import { PlatformCarriersController } from './controllers/platform-carriers.controller';
import { PlatformDashboardController } from './controllers/platform-dashboard.controller';
import { PlatformRolesController } from './controllers/platform-roles.controller';
import { PlatformTenantsController } from './controllers/platform-tenants.controller';
import { PlatformAuditService } from './services/platform-audit.service';
import { PlatformBillingService } from './services/platform-billing.service';
import { PlatformCarriersService } from './services/platform-carriers.service';
import { PlatformDashboardService } from './services/platform-dashboard.service';
import { PlatformRolesService } from './services/platform-roles.service';
import { PlatformTenantsService } from './services/platform-tenants.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    EnterpriseObservabilityCoreModule,
  ],
  controllers: [
    PlatformDashboardController,
    PlatformTenantsController,
    PlatformBillingController,
    PlatformRolesController,
    PlatformCarriersController,
    PlatformAuditController,
  ],
  providers: [
    PlatformDashboardService,
    PlatformTenantsService,
    PlatformBillingService,
    PlatformRolesService,
    PlatformCarriersService,
    PlatformAuditService,
  ],
  exports: [
    PlatformDashboardService,
    PlatformTenantsService,
    PlatformBillingService,
    PlatformRolesService,
    PlatformCarriersService,
    PlatformAuditService,
  ],
})
export class PlatformAdminModule {}
