import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarrierAdminModule } from '../carrier-admin/carrier-admin.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseOpsCoreModule } from '../enterprise-ops/enterprise-ops-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { PresenceModule } from '../presence/module';
import { RecordingModule } from '../recording/module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { SupervisorConsoleController } from './controllers/supervisor-console.controller';
import { SupervisorActionsService } from './services/supervisor-actions.service';
import { SupervisorAgentsService } from './services/supervisor-agents.service';
import { SupervisorCallsService } from './services/supervisor-calls.service';
import { SupervisorDashboardService } from './services/supervisor-dashboard.service';
import { SupervisorEventsService } from './services/supervisor-events.service';
import { SupervisorQueuesService } from './services/supervisor-queues.service';
import { SupervisorRecordingsService } from './services/supervisor-recordings.service';
import { SupervisorReportsService } from './services/supervisor-reports.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    EnterpriseOpsCoreModule,
    PresenceModule,
    EnterpriseObservabilityCoreModule,
    CarrierAdminModule,
    RecordingModule,
  ],
  controllers: [SupervisorConsoleController],
  providers: [
    SupervisorDashboardService,
    SupervisorAgentsService,
    SupervisorQueuesService,
    SupervisorCallsService,
    SupervisorActionsService,
    SupervisorRecordingsService,
    SupervisorReportsService,
    SupervisorEventsService,
  ],
  exports: [SupervisorDashboardService, SupervisorEventsService],
})
export class SupervisorConsoleModule {}
