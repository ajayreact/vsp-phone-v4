import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarrierAdminModule } from '../carrier-admin/carrier-admin.module';
import { EnterpriseHaCoreModule } from '../enterprise-ha/enterprise-ha-core.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { ProductionPlatformCoreModule } from '../production-platform/production-platform-core.module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { KamailioRpcClient } from './clients/kamailio-rpc.client';
import { RtpengineNgClient } from './clients/rtpengine-ng.client';
import { OpsCenterController } from './controllers/ops-center.controller';
import { OpsTelecomController } from './controllers/ops-telecom.controller';
import { OpsAlertsService } from './services/ops-alerts.service';
import { OpsCallDiagnosticsService } from './services/ops-call-diagnostics.service';
import { OpsCarrierMonitoringService } from './services/ops-carrier-monitoring.service';
import { OpsFraudDetectionService } from './services/ops-fraud-detection.service';
import { OpsKamailioService } from './services/ops-kamailio-ops.service';
import { OpsMediaMonitoringService } from './services/ops-media-monitoring.service';
import { OpsNocDashboardService } from './services/ops-noc-dashboard.service';
import { OpsRtpengineService } from './services/ops-rtpengine-ops.service';
import { OpsSipDialogsService } from './services/ops-sip-dialogs.service';
import { OpsSipRegistrationsService } from './services/ops-sip-registrations.service';
import { OpsSipTraceService } from './services/ops-sip-trace.service';
import { OpsSyntheticMonitoringService } from './services/ops-synthetic-monitoring.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseObservabilityCoreModule,
    EnterpriseHaCoreModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    ProductionPlatformCoreModule,
    CarrierAdminModule,
    RecordingCoreModule,
  ],
  controllers: [OpsCenterController, OpsTelecomController],
  providers: [
    OpsSipRegistrationsService,
    KamailioRpcClient,
    RtpengineNgClient,
    OpsNocDashboardService,
    OpsSipDialogsService,
    OpsSipTraceService,
    OpsMediaMonitoringService,
    OpsKamailioService,
    OpsRtpengineService,
    OpsCarrierMonitoringService,
    OpsAlertsService,
    OpsFraudDetectionService,
    OpsSyntheticMonitoringService,
    OpsCallDiagnosticsService,
  ],
})
export class OpsCenterModule {}
