import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import { KamailioPersistenceService } from '../../enterprise-ha/backup/kamailio-persistence.service';
import { BackupReadinessService } from '../../production-platform/backups/backup-readiness.service';
import { ProductionConfigValidatorService } from '../../production-platform/configuration/production-config-validator.service';
import { DeploymentReadinessService } from '../../production-platform/deployment/deployment-readiness.service';
import { RestoreValidationService } from '../../production-platform/restore/restore-validation.service';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { ShutdownCoordinatorService } from '../../enterprise-ha/services/shutdown-coordinator.service';
import { MigrationImportService } from '../../migration-toolkit/import/migration-import.service';
import { MIGRATION_REDIS_KEYS } from '../../migration-toolkit/types/migration.types';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { CutoverReadinessReport } from '../types/cutover.types';

/** Phase 20 — final production readiness gate (blocks cutover on critical failure). */
@Injectable()
export class CutoverReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly deployment: DeploymentReadinessService,
    private readonly configValidator: ProductionConfigValidatorService,
    private readonly health: EnterpriseHealthService,
    private readonly backup: BackupReadinessService,
    private readonly restore: RestoreValidationService,
    private readonly shutdown: ShutdownCoordinatorService,
    private readonly migrationImports: MigrationImportService,
    private readonly redis: TelecomRedisService,
    private readonly kamailioPersistence: KamailioPersistenceService,
  ) {}

  async buildReport(): Promise<CutoverReadinessReport> {
    const checks: CutoverReadinessReport['checks'] = {};
    const criticalFailures: string[] = [];

    const add = (key: string, pass: boolean, critical: boolean, detail?: string) => {
      checks[key] = { pass, critical, detail };
      if (!pass && critical) criticalFailures.push(`${key}: ${detail ?? 'failed'}`);
    };

    const [phase18, healthAll, backupReport, restoreResult, migrationOk] = await Promise.all([
      this.deployment.buildReport(),
      this.health.checkAll(),
      this.backup.evaluate(),
      this.restore.validate(),
      this.checkMigrationValidation(),
    ]);

    add('phase18_readiness', phase18.ready, true, phase18.ready ? undefined : 'Phase 18 readiness not green');
    add('migration_validation', migrationOk, true, migrationOk ? undefined : 'No verified migration batches');
    add('api_health', healthAll.api.status === 'up' && !this.shutdown.isDraining(), true);
    add('postgresql', healthAll.postgres.status === 'up', true, healthAll.postgres.failureReason);
    add('redis', healthAll.redis.status === 'up', true, healthAll.redis.failureReason);
    add('kamailio', healthAll.kamailio.status === 'up', true, healthAll.kamailio.failureReason);
    add('rtpengine', healthAll.rtpengine.status === 'up', true, healthAll.rtpengine.failureReason);
    add(
      'telnyx',
      healthAll.telnyx.status !== 'down',
      true,
      healthAll.telnyx.failureReason,
    );

    const tlsEnabled = String(this.config.get('TLS_ENABLED') ?? 'false').toLowerCase() === 'true';
    const vspEnv = this.config.get('VSP_ENV') ?? 'development';
    const tlsRequired = vspEnv === 'production';
    add('tls', !tlsRequired || tlsEnabled, tlsRequired, tlsEnabled ? undefined : 'TLS not enabled');

    const certOk = this.checkCertificates();
    add('certificates', certOk.pass, tlsRequired, certOk.detail);

    add('backup_readiness', backupReport.ready, true, backupReport.ready ? undefined : 'Backup not configured');
    add('restore_verification', restoreResult.valid, true, restoreResult.detail);
    add('observability', healthAll.api.status === 'up', true, 'Observability probes available');

    const configResult =
      this.configValidator.getLastResult() ?? (await this.configValidator.validate());
    add('configuration', configResult.ok, true, configResult.errors.join(', ') || undefined);

    const kamReport = this.kamailioPersistence.evaluate();
    add(
      'kamailio_service_auth',
      kamReport.serviceAuthConfigured,
      vspEnv === 'production' || vspEnv === 'prod',
      kamReport.serviceAuthConfigured ? undefined : 'TELECOM_SERVICE_AUTH_TOKEN not configured',
    );
    add(
      'kamailio_usrloc_persistence',
      kamReport.restartSafe || vspEnv === 'development' || vspEnv === 'dev',
      false,
      kamReport.detail,
    );

    const ready = criticalFailures.length === 0;

    return {
      ts: new Date().toISOString(),
      phase: 'phase20-production-cutover',
      ready,
      blocked: !ready,
      criticalFailures,
      checks,
    };
  }

  private async checkMigrationValidation(): Promise<boolean> {
    const vspEnv = this.config.get('VSP_ENV') ?? 'development';
    if (vspEnv === 'development' || vspEnv === 'dev') return true;

    const indexRaw = await this.redis.lrange(MIGRATION_REDIS_KEYS.batchIndex, 0, 49);
    if (!indexRaw.length) return false;

    for (const batchId of indexRaw) {
      const batch = await this.migrationImports.getBatch(batchId);
      if (batch?.verification?.passed || batch?.status === 'verified') return true;
    }
    return false;
  }

  private checkCertificates(): { pass: boolean; detail?: string } {
    const certFile = this.config.get<string>('TLS_API_CERT_FILE');
    const keyFile = this.config.get<string>('TLS_API_KEY_FILE');
    if (!certFile && !keyFile) {
      const vspEnv = this.config.get('VSP_ENV') ?? 'development';
      if (vspEnv === 'production') return { pass: false, detail: 'TLS cert files not configured' };
      return { pass: true, detail: 'TLS cert check skipped (development)' };
    }
    try {
      if (certFile && !fs.existsSync(certFile)) return { pass: false, detail: `Cert file missing: ${certFile}` };
      if (keyFile && !fs.existsSync(keyFile)) return { pass: false, detail: `Key file missing: ${keyFile}` };
      return { pass: true };
    } catch (err) {
      return { pass: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
