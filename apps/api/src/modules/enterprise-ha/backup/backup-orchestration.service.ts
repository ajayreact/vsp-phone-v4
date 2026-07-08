import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { HA_REDIS_KEYS } from '../redis/ha-redis.keys';

const execFileAsync = promisify(execFile);

export interface BackupExecutionResult {
  ok: boolean;
  ts: string;
  postgres?: { ok: boolean; artifact?: string; detail?: string };
  redis?: { ok: boolean; persistenceEnabled: boolean; detail?: string };
  verification?: { ok: boolean; detail?: string };
}

export interface BackupStatusReport {
  ts: string;
  backupLocationConfigured: boolean;
  backupLocation?: string;
  lastExecution?: BackupExecutionResult;
  redisPersistence: { ok: boolean; detail?: string };
  restoreVerifyEnabled: boolean;
}

/** Remediation C-02 — backup orchestration hooks (vendor-neutral). */
@Injectable()
export class BackupOrchestrationService {
  private readonly logger = new Logger(BackupOrchestrationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: TelecomRedisService,
  ) {}

  async getStatus(): Promise<BackupStatusReport> {
    const location = this.config.get<string>('BACKUP_LOCATION');
    const redisPersistence = await this.verifyRedisPersistence();
    const lastRaw = await this.redis.get(HA_REDIS_KEYS.backupLastExecution);
    let lastExecution: BackupExecutionResult | undefined;
    if (lastRaw) {
      try {
        lastExecution = JSON.parse(lastRaw) as BackupExecutionResult;
      } catch {
        /* ignore */
      }
    }
    return {
      ts: new Date().toISOString(),
      backupLocationConfigured: Boolean(location?.trim()),
      backupLocation: location || undefined,
      lastExecution,
      redisPersistence,
      restoreVerifyEnabled:
        String(this.config.get('HA_RESTORE_VERIFY_ENABLED') ?? 'true').toLowerCase() !== 'false',
    };
  }

  async executeBackup(): Promise<BackupExecutionResult> {
    const ts = new Date().toISOString();
    const location = this.config.get<string>('BACKUP_LOCATION');
    if (!location?.trim()) {
      const fail: BackupExecutionResult = {
        ok: false,
        ts,
        verification: { ok: false, detail: 'BACKUP_LOCATION not configured' },
      };
      await this.persistResult(fail);
      return fail;
    }

    const [postgres, redisPersist] = await Promise.all([
      this.executePostgresBackup(location),
      this.verifyRedisPersistence(),
    ]);

    const verification = await this.verifyBackupArtifacts(location);
    const result: BackupExecutionResult = {
      ok: postgres.ok && redisPersist.ok && verification.ok,
      ts,
      postgres,
      redis: { ok: redisPersist.ok, persistenceEnabled: redisPersist.ok, detail: redisPersist.detail },
      verification,
    };

    await this.persistResult(result);
    this.logger.log(JSON.stringify({ event: 'backup.execution.complete', ok: result.ok, ts }));
    return result;
  }

  async verifyRestoreReadiness(): Promise<{ ok: boolean; ts: string; detail: string }> {
    const location = this.config.get<string>('BACKUP_LOCATION');
    const ts = new Date().toISOString();
    if (!location?.trim()) {
      return { ok: false, ts, detail: 'BACKUP_LOCATION not configured' };
    }
    const verification = await this.verifyBackupArtifacts(location);
    const redisPersistence = await this.verifyRedisPersistence();
    const ok = verification.ok && redisPersistence.ok;
    return {
      ok,
      ts,
      detail: ok ? 'Restore readiness verified (hooks only; no data overwritten)' : 'Restore readiness failed',
    };
  }

  private async executePostgresBackup(
    location: string,
  ): Promise<{ ok: boolean; artifact?: string; detail?: string }> {
    const hook = this.config.get<string>('BACKUP_POSTGRES_HOOK_CMD')?.trim();
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    if (hook) {
      try {
        await execFileAsync('sh', ['-c', hook], {
          env: { ...process.env, BACKUP_LOCATION: location, BACKUP_TIMESTAMP: ts },
          timeout: 300_000,
        });
        return { ok: true, detail: 'BACKUP_POSTGRES_HOOK_CMD succeeded' };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (!databaseUrl) {
      return { ok: false, detail: 'DATABASE_URL not configured' };
    }

    await fs.mkdir(location, { recursive: true });
    const artifact = path.join(location, `postgres-${ts}.sql`);
    try {
      await execFileAsync(
        'pg_dump',
        ['--dbname', databaseUrl, '--file', artifact, '--no-owner', '--no-privileges'],
        { timeout: 300_000 },
      );
      return { ok: true, artifact, detail: 'pg_dump completed' };
    } catch (err) {
      return {
        ok: false,
        detail: `pg_dump failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async verifyRedisPersistence(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.redis.isAvailable()) {
      return { ok: false, detail: 'Redis unavailable' };
    }
    const info = await this.redis.info();
    if (!info) {
      return { ok: false, detail: 'Redis INFO unavailable' };
    }
    const aof = /aof_enabled:1/.test(info);
    const rdb = /rdb_last_save_time:[1-9]/.test(info);
    const ok = aof || rdb;
    return {
      ok,
      detail: ok
        ? `Redis persistence OK (aof=${aof}, rdb=${rdb})`
        : 'Redis persistence not confirmed — enable AOF or RDB',
    };
  }

  private async verifyBackupArtifacts(location: string): Promise<{ ok: boolean; detail?: string }> {
    try {
      const entries = await fs.readdir(location);
      const artifacts = entries.filter((e) => e.endsWith('.sql') || e.endsWith('.rdb') || e.endsWith('.gz'));
      if (!artifacts.length) {
        return { ok: false, detail: 'No backup artifacts found in BACKUP_LOCATION' };
      }
      return { ok: true, detail: `Found ${artifacts.length} backup artifact(s)` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async persistResult(result: BackupExecutionResult): Promise<void> {
    await this.redis.setex(HA_REDIS_KEYS.backupLastExecution, 86400 * 7, JSON.stringify(result));
  }
}
