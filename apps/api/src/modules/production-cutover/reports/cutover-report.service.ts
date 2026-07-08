import { Injectable, NotFoundException } from '@nestjs/common';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { ChecklistEngineService } from '../cutover/checklist-engine.service';
import { CutoverMonitoringService } from '../monitoring/cutover-monitoring.service';
import { CutoverReadinessService } from '../validation/cutover-readiness.service';
import { SmokeTestService } from '../smoke-tests/smoke-test.service';
import { RollbackPlanService } from '../rollback/rollback-plan.service';
import { CUTOVER_REDIS_KEYS } from '../types/cutover.types';

/** Phase 20 — cutover report generation (JSON + CSV). */
@Injectable()
export class CutoverReportService {
  constructor(
    private readonly readiness: CutoverReadinessService,
    private readonly monitoring: CutoverMonitoringService,
    private readonly smoke: SmokeTestService,
    private readonly checklists: ChecklistEngineService,
    private readonly rollback: RollbackPlanService,
    private readonly redis: TelecomRedisService,
  ) {}

  async buildFullReport(batchId?: string) {
    const [readiness, status, checklists, rollbackPlan, latestSmoke] = await Promise.all([
      this.readiness.buildReport(),
      this.monitoring.buildStatus(),
      this.checklists.getAllChecklists(),
      this.rollback.generate(batchId),
      this.smoke.getLatest(),
    ]);

    const report = {
      ts: new Date().toISOString(),
      phase: 'phase20-production-cutover',
      readiness,
      status,
      checklists,
      checklistSummary: this.checklists.completionSummary(checklists),
      smokeTests: latestSmoke,
      rollbackPlan,
      migrationSummary: status.migrationProgress,
    };

    await this.redis.setex(CUTOVER_REDIS_KEYS.report, 86400, JSON.stringify(report));
    return report;
  }

  async exportJson(batchId?: string) {
    return this.buildFullReport(batchId);
  }

  async exportCsv(batchId?: string): Promise<string> {
    const report = await this.buildFullReport(batchId);
    const lines: string[] = ['section,key,value,detail'];

    lines.push(`readiness,ready,${report.readiness.ready},`);
    for (const [key, check] of Object.entries(report.readiness.checks)) {
      lines.push(`readiness_check,${key},${check.pass},${this.csvEscape(check.detail ?? '')}`);
    }

    if (report.smokeTests) {
      for (const r of report.smokeTests.results) {
        lines.push(`smoke_test,${r.id},${r.pass},${this.csvEscape(r.detail ?? '')}`);
      }
    }

    for (const [phase, cl] of Object.entries(report.checklists)) {
      for (const item of cl.items) {
        lines.push(
          `checklist,${phase}:${item.id},${item.status},${this.csvEscape(item.description)}`,
        );
      }
    }

    return lines.join('\n');
  }

  async getCachedReport() {
    const raw = await this.redis.get(CUTOVER_REDIS_KEYS.report);
    if (!raw) throw new NotFoundException('No cutover report generated yet');
    try {
      return JSON.parse(raw);
    } catch {
      throw new NotFoundException('Invalid cached report');
    }
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
