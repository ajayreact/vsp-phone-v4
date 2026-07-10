import { Module } from '@nestjs/common';
import { CarrierModule } from '../carrier/module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { EnterpriseAuditService } from './audit/enterprise-audit.service';
import { ObservabilityController } from './controllers/observability.controller';
import { TelecomMetricsController } from './controllers/telecom-metrics.controller';
import { OperationsDashboardService } from './dashboard/operations-dashboard.service';
import { CallInspectorService } from './diagnostics/call-inspector.service';
import { ObservabilityEventsListener } from './events/observability-events.listener';
import { EnterpriseHealthService } from './health/enterprise-health.service';
import { TelecomStructuredLoggerService } from './logging/telecom-structured-logger.service';
import { MetricsRegistryService } from './metrics/metrics-registry.service';
import { MetricsService } from './metrics/metrics.service';
import { CallTraceService } from './tracing/call-trace.service';

@Module({
  imports: [TelecomInfrastructureModule, CarrierModule],
  controllers: [ObservabilityController, TelecomMetricsController],
  providers: [
    TelecomStructuredLoggerService,
    MetricsRegistryService,
    MetricsService,
    CallTraceService,
    EnterpriseAuditService,
    EnterpriseHealthService,
    CallInspectorService,
    OperationsDashboardService,
    ObservabilityEventsListener,
  ],
  exports: [
    TelecomStructuredLoggerService,
    MetricsService,
    CallTraceService,
    EnterpriseAuditService,
    EnterpriseHealthService,
    OperationsDashboardService,
    CallInspectorService,
  ],
})
export class EnterpriseObservabilityCoreModule {}
