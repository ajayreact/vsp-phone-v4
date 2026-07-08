import { Injectable } from '@nestjs/common';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { MigrationImportService } from '../../migration-toolkit/import/migration-import.service';
import { MIGRATION_REDIS_KEYS } from '../../migration-toolkit/types/migration.types';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { CutoverReadinessService } from '../validation/cutover-readiness.service';
import { SmokeTestService } from '../smoke-tests/smoke-test.service';
import { CutoverStateService } from '../cutover/cutover-state.service';
import type { CutoverStatusReport } from '../types/cutover.types';

/** Phase 20 — cutover monitoring aggregation. */
@Injectable()
export class CutoverMonitoringService {
  constructor(
    private readonly readiness: CutoverReadinessService,
    private readonly smoke: SmokeTestService,
    private readonly health: EnterpriseHealthService,
    private readonly state: CutoverStateService,
    private readonly migrationImports: MigrationImportService,
    private readonly redis: TelecomRedisService,
  ) {}

  async buildStatus(): Promise<CutoverStatusReport> {
    const [readinessReport, latestSmoke, healthAll, cutoverState] = await Promise.all([
      this.readiness.buildReport(),
      this.smoke.getLatest(),
      this.health.checkAll(),
      this.state.getState(),
    ]);

    const migrationProgress = await this.migrationProgress();
    const healthSummary: Record<string, string> = {};
    for (const [key, val] of Object.entries(healthAll)) {
      healthSummary[key] = val.status;
    }

    const activeAlarms: string[] = [];
    for (const [key, check] of Object.entries(readinessReport.checks)) {
      if (!check.pass && check.critical) activeAlarms.push(`${key}: ${check.detail ?? 'failed'}`);
    }
    if (latestSmoke && !latestSmoke.passed) {
      activeAlarms.push('smoke_tests: one or more smoke tests failed');
    }

    return {
      ts: new Date().toISOString(),
      phase: 'phase20-production-cutover',
      cutoverState,
      readiness: { ready: readinessReport.ready, blocked: readinessReport.blocked },
      migrationProgress,
      smokeTests: {
        lastRunId: latestSmoke?.runId,
        passed: latestSmoke?.passed,
        runAt: latestSmoke?.ts,
      },
      healthSummary,
      activeAlarms,
      failedValidations: readinessReport.criticalFailures,
    };
  }

  private async migrationProgress(): Promise<CutoverStatusReport['migrationProgress']> {
    const batchIds = await this.redis.lrange(MIGRATION_REDIS_KEYS.batchIndex, 0, 49);
    let verifiedBatches = 0;
    let latestBatchId: string | undefined;

    for (const batchId of batchIds) {
      latestBatchId = latestBatchId ?? batchId;
      const batch = await this.migrationImports.getBatch(batchId);
      if (batch?.verification?.passed || batch?.status === 'verified') verifiedBatches++;
    }

    return {
      batchCount: batchIds.length,
      latestBatchId,
      verifiedBatches,
    };
  }
}
