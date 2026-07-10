import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarrierAdminModule } from '../carrier-admin/carrier-admin.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { ProvisioningCoreModule } from '../provisioning/provisioning-core.module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { TenantAudioLibraryController } from './controllers/tenant-audio-library.controller';
import { TenantCallRoutesController } from './controllers/tenant-call-routes.controller';
import { TenantCdrController } from './controllers/tenant-cdr.controller';
import { TenantDashboardController } from './controllers/tenant-dashboard.controller';
import { TenantDevicesController } from './controllers/tenant-devices.controller';
import { TenantDialPlansController } from './controllers/tenant-dial-plans.controller';
import { TenantProvisioningController } from './controllers/tenant-provisioning.controller';
import { TenantDidsController } from './controllers/tenant-dids.controller';
import { TenantExtensionsController } from './controllers/tenant-extensions.controller';
import { TenantHolidayCalendarsController } from './controllers/tenant-holiday-calendars.controller';
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
import { TenantTimeConditionsController } from './controllers/tenant-time-conditions.controller';
import { TenantUsersController } from './controllers/tenant-users.controller';
import { TenantVoicemailController } from './controllers/tenant-voicemail.controller';
import { TenantAudioLibraryService } from './services/tenant-audio-library.service';
import { TenantCallRoutesService } from './services/tenant-call-routes.service';
import { TenantCdrService } from './services/tenant-cdr.service';
import { TenantDevicesService } from './services/tenant-devices.service';
import { TenantDeviceProvisioningService } from './services/tenant-device-provisioning.service';
import { TenantDialPlansService } from './services/tenant-dial-plans.service';
import { TenantProvisioningTemplatesService } from './services/tenant-provisioning-templates.service';
import { TenantDidsService } from './services/tenant-dids.service';
import { TenantExtensionsService } from './services/tenant-extensions.service';
import { TenantHolidayCalendarsService } from './services/tenant-holiday-calendars.service';
import { TenantLinesService } from './services/tenant-lines.service';
import { TenantIvrService } from './services/tenant-ivr.service';
import { TenantMarketplaceService } from './services/tenant-marketplace.service';
import { TenantNumberRequestsService } from './services/tenant-number-requests.service';
import { TenantQueuesService } from './services/tenant-queues.service';
import { TenantQueueEventsService } from './services/tenant-queue-events.service';
import { TenantRecordingsService } from './services/tenant-recordings.service';
import { TenantRingGroupsService } from './services/tenant-ring-groups.service';
import { TenantRoutingEventsService } from './services/tenant-routing-events.service';
import { TenantRoutingService } from './services/tenant-routing.service';
import { TenantTimeConditionsService } from './services/tenant-time-conditions.service';
import { TenantVoicemailService } from './services/tenant-voicemail.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    CarrierAdminModule,
    EnterpriseObservabilityCoreModule,
    ProvisioningCoreModule,
    RecordingCoreModule,
  ],
  controllers: [
    TenantLinesController,
    TenantExtensionsController,
    TenantUsersController,
    TenantQueuesController,
    TenantIvrController,
    TenantRingGroupsController,
    TenantCallRoutesController,
    TenantTimeConditionsController,
    TenantHolidayCalendarsController,
    TenantAudioLibraryController,
    TenantDialPlansController,
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
    TenantQueueEventsService,
    TenantIvrService,
    TenantRingGroupsService,
    TenantCallRoutesService,
    TenantTimeConditionsService,
    TenantHolidayCalendarsService,
    TenantAudioLibraryService,
    TenantDialPlansService,
    TenantRoutingEventsService,
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
