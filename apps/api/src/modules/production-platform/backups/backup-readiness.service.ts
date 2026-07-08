import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupOrchestrationService } from '../../enterprise-ha/backup/backup-orchestration.service';
import { BackupDrService } from '../../enterprise-ha/services/backup-dr.service';

export interface BackupReadinessReport {
  ready: boolean;
  backupLocationConfigured: boolean;
  backupScheduleConfigured: boolean;
  restoreVerifyHookEnabled: boolean;
  backupLocation?: string;
  backupSchedule?: string;
  redisPersistenceOk?: boolean;
  lastBackupOk?: boolean;
}

/** Phase 18 — backup readiness validation (Remediation C-02 orchestration hooks). */
@Injectable()
export class BackupReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly backupDr: BackupDrService,
    private readonly orchestration: BackupOrchestrationService,
  ) {}

  async evaluate(): Promise<BackupReadinessReport> {
    const status = this.backupDr.status();
    const orchestration = await this.orchestration.getStatus();
    const schedule = this.config.get<string>('BACKUP_SCHEDULE');
    const scheduleConfigured = Boolean(schedule?.trim());
    const vspEnv = this.config.get('VSP_ENV') ?? 'development';
    const ready =
      orchestration.backupLocationConfigured &&
      orchestration.redisPersistence.ok &&
      status.restoreVerifyHookEnabled &&
      (scheduleConfigured || vspEnv === 'development' || vspEnv === 'dev');

    return {
      ready,
      backupLocationConfigured: orchestration.backupLocationConfigured,
      backupScheduleConfigured: scheduleConfigured,
      restoreVerifyHookEnabled: status.restoreVerifyHookEnabled,
      backupLocation: orchestration.backupLocation,
      backupSchedule: schedule || undefined,
      redisPersistenceOk: orchestration.redisPersistence.ok,
      lastBackupOk: orchestration.lastExecution?.ok,
    };
  }
}
