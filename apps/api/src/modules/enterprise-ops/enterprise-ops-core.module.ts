import { Module } from '@nestjs/common';
import { CallMediaCoreModule } from '../call-media/call-media-core.module';
import { PresenceModule } from '../presence/module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { BlfEventsListener } from './listeners/blf-events.listener';
import { EnterpriseOpsEventsListener } from './listeners/enterprise-ops-events.listener';
import { BlfNotifyService } from './runtime/blf-notify.service';
import { BlfSubscriptionService } from './runtime/blf-subscription.service';
import {
  DeviceStateSyncService,
  PresenceNotificationService,
} from './runtime/device-state-sync.service';
import { EnterpriseOpsResolverService } from './runtime/enterprise-ops-resolver.service';
import { EnterpriseOpsRoutingService } from './runtime/enterprise-ops-routing.service';
import { HuntGroupService } from './runtime/hunt-group.service';
import { IntercomRuntimeService } from './runtime/intercom-runtime.service';
import { LineForkService } from './runtime/line-fork.service';
import { PagingRuntimeService } from './runtime/paging-runtime.service';
import { ParkRuntimeService } from './runtime/park-runtime.service';
import { PickupRuntimeService } from './runtime/pickup-runtime.service';
import { RingGroupService } from './runtime/ring-group.service';
import { SlaAppearanceService } from './runtime/sla-appearance.service';
import { SupervisorMonitorService } from './runtime/supervisor-monitor.service';

@Module({
  imports: [TelecomInfrastructureModule, PresenceModule, CallMediaCoreModule],
  providers: [
    LineForkService,
    EnterpriseOpsResolverService,
    EnterpriseOpsRoutingService,
    BlfSubscriptionService,
    BlfNotifyService,
    SlaAppearanceService,
    ParkRuntimeService,
    PickupRuntimeService,
    RingGroupService,
    HuntGroupService,
    PagingRuntimeService,
    IntercomRuntimeService,
    SupervisorMonitorService,
    DeviceStateSyncService,
    PresenceNotificationService,
    BlfEventsListener,
    EnterpriseOpsEventsListener,
  ],
  exports: [
    EnterpriseOpsRoutingService,
    BlfSubscriptionService,
    BlfNotifyService,
    ParkRuntimeService,
    PickupRuntimeService,
    SupervisorMonitorService,
    DeviceStateSyncService,
    PresenceNotificationService,
  ],
})
export class EnterpriseOpsCoreModule {}
