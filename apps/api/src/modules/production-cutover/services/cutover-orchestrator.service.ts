import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/jwt.util';
import { SecurityAuditService } from '../../enterprise-security/audit/security-audit.service';
import { TelecomStructuredLoggerService } from '../../enterprise-observability/logging/telecom-structured-logger.service';
import { ShutdownCoordinatorService } from '../../enterprise-ha/services/shutdown-coordinator.service';
import { CutoverReadinessService } from '../validation/cutover-readiness.service';
import { CutoverMonitoringService } from '../monitoring/cutover-monitoring.service';
import { SmokeTestService } from '../smoke-tests/smoke-test.service';
import { RollbackPlanService } from '../rollback/rollback-plan.service';
import { CutoverReportService } from '../reports/cutover-report.service';
import { CutoverStateService } from '../cutover/cutover-state.service';

/** Phase 20 — cutover workflow orchestration. */
@Injectable()
export class CutoverOrchestratorService {
  private readonly logger = new Logger(CutoverOrchestratorService.name);

  constructor(
    private readonly readiness: CutoverReadinessService,
    private readonly monitoring: CutoverMonitoringService,
    private readonly smoke: SmokeTestService,
    private readonly rollback: RollbackPlanService,
    private readonly reports: CutoverReportService,
    private readonly state: CutoverStateService,
    private readonly shutdown: ShutdownCoordinatorService,
    private readonly audit: SecurityAuditService,
    private readonly structuredLog: TelecomStructuredLoggerService,
  ) {}

  async getStatus() {
    return this.monitoring.buildStatus();
  }

  async getReadiness(user: JwtPayload) {
    this.assertNotDraining();
    const report = await this.readiness.buildReport();
    this.auditEvent(user, 'cutover.readiness', { ready: report.ready });
    return report;
  }

  async runSmokeTests(user: JwtPayload) {
    this.assertNotDraining();
    const readiness = await this.readiness.buildReport();
    if (readiness.blocked) {
      throw new ServiceUnavailableException({
        message: 'Smoke tests blocked: production readiness gate failed',
        criticalFailures: readiness.criticalFailures,
      });
    }

    await this.state.setState('smoke_testing');
    const run = await this.smoke.execute();
    if (run.passed) {
      await this.state.setState('completed', { smokeRunId: run.runId });
    } else {
      await this.state.setState('in_progress', { smokeRunId: run.runId, smokePassed: false });
    }

    this.auditEvent(user, 'cutover.smoke_test', { runId: run.runId, passed: run.passed });
    this.logEvent(user, 'cutover.smoke_test', run.runId);
    return run;
  }

  async getReport(user: JwtPayload, batchId?: string, format?: 'json' | 'csv') {
    this.auditEvent(user, 'cutover.report', { batchId, format });
    if (format === 'csv') {
      const csv = await this.reports.exportCsv(batchId);
      return { format: 'csv', content: csv };
    }
    return this.reports.exportJson(batchId);
  }

  async getRollbackPlan(user: JwtPayload, batchId?: string) {
    const plan = await this.rollback.generate(batchId);
    this.auditEvent(user, 'cutover.rollback_plan', { batchId: plan.batchId });
    return plan;
  }

  private assertNotDraining(): void {
    if (this.shutdown.isDraining()) {
      throw new ServiceUnavailableException('Cutover blocked: API is shutting down');
    }
  }

  private auditEvent(user: JwtPayload, action: string, detail: Record<string, unknown>): void {
    this.audit.adminAction({
      tenantId: user.tenantId,
      userId: user.sub,
      action,
      resourceType: 'cutover',
      resourceId: String(detail.runId ?? detail.batchId ?? ''),
      detail,
    });
  }

  private logEvent(user: JwtPayload, event: string, resourceId: string): void {
    this.structuredLog.log({
      event,
      category: 'provisioning',
      severity: 'info',
      tenantId: user.tenantId,
      userId: user.sub,
      detail: { resourceId, phase: 'phase20-production-cutover' },
    });
  }
}
