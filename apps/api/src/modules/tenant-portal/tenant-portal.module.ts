import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarrierAdminModule } from '../carrier-admin/carrier-admin.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { ProvisioningCoreModule } from '../provisioning/provisioning-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { TenantCdrController } from './controllers/tenant-cdr.controller';
import { TenantDashboardController } from './controllers/tenant-dashboard.controller';
import { TenantDevicesController } from './controllers/tenant-devices.controller';
import { TenantProvisioningController } from './controllers/tenant-provisioning.controller';
import { TenantDidsController } from './controllers/tenant-dids.controller';
import { TenantExtensionsController } from './controllers/tenant-extensions.controller';
import { TenantLinesController } from './controllers/tenant-lines.controller';
import { TenantIvrController } from './controllers/tenant-ivr.controller';
import {
  TenantMarketplaceController,
  TenantNumberRequestsController,
} from './controllers/tenant-marketplace.controller';
import { TenantQueuesController } from './controllers/tenant-queues.controller';
import { TenantRecordingsController } from './controllers/tenant-recordings.controller';
import { TenantRingGroupsController } from './controllers/tenant-ring-groups.controller';
import { TenantRoutingController } from './controllers/tenant-routing.controller';
import { TenantUsersController } from './controllers/tenant-users.controller';
import { TenantVoicemailController } from './controllers/tenant-voicemail.controller';
import { TenantCdrService } from './services/tenant-cdr.service';
import { TenantDevicesService } from './services/tenant-devices.service';
import { TenantDeviceProvisioningService } from './services/tenant-device-provisioning.service';
import { TenantProvisioningTemplatesService } from './services/tenant-provisioning-templates.service';
import { TenantDidsService } from './services/tenant-dids.service';
import { TenantExtensionsService } from './services/tenant-extensions.service';
import { TenantLinesService } from './services/tenant-lines.service';
import { TenantIvrService } from './services/tenant-ivr.service';
import { TenantMarketplaceService } from './services/tenant-marketplace.service';
import { TenantNumberRequestsService } from './services/tenant-number-requests.service';
import { TenantQueuesService } from './services/tenant-queues.service';
import { TenantRecordingsService } from './services/tenant-recordings.service';
import { TenantRingGroupsService } from './services/tenant-ring-groups.service';
import { TenantRoutingService } from './services/tenant-routing.service';
import { TenantVoicemailService } from './services/tenant-voicemail.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    CarrierAdminModule,
    EnterpriseObservabilityCoreModule,
    ProvisioningCoreModule,
  ],
  controllers: [
    TenantLinesController,
    TenantExtensionsController,
    TenantUsersController,
    TenantQueuesController,
    TenantIvrController,
    TenantRingGroupsController,
    TenantDevicesController,
    TenantProvisioningController,
    TenantRecordingsController,
    TenantCdrController,
    TenantVoicemailController,
    TenantRoutingController,
    TenantDidsController,
    TenantMarketplaceController,
    TenantNumberRequestsController,
    TenantDashboardController,
  ],
  providers: [
    TenantLinesService,
    TenantExtensionsService,
    TenantQueuesService,
    TenantIvrService,
    TenantRingGroupsService,
    TenantDevicesService,
    TenantDeviceProvisioningService,
    TenantProvisioningTemplatesService,
    TenantRecordingsService,
    TenantCdrService,
    TenantVoicemailService,
    TenantRoutingService,
    TenantDidsService,
    TenantMarketplaceService,
    TenantNumberRequestsService,
  ],
})
export class TenantPortalModule {}
