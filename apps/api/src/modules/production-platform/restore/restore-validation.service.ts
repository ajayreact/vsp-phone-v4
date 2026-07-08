import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { PRODUCTION_REDIS_KEYS } from '../configuration/production-config.constants';
import { ReleaseInfoService } from '../releases/release-info.service';

export interface RestoreValidationResult {
  valid: boolean;
  ts: string;
  checks: {
    configSnapshot: boolean;
    schemaCompatibility: boolean;
    runtimeCompatibility: boolean;
  };
  detail?: string;
}

/** Phase 18 — restore validation (read-only; does not overwrite production data). */
@Injectable()
export class RestoreValidationService {
  constructor(
    private readonly redis: TelecomRedisService,
    private readonly prisma: PrismaService,
    private readonly release: ReleaseInfoService,
  ) {}

  async validate(): Promise<RestoreValidationResult> {
    const ts = new Date().toISOString();
    const snapshotRaw = await this.redis.get(PRODUCTION_REDIS_KEYS.configExport);
    const configSnapshot = Boolean(snapshotRaw);

    let schemaCompatibility = false;
    if (this.prisma.connected) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        schemaCompatibility = true;
      } catch {
        schemaCompatibility = false;
      }
    }

    const version = this.release.getVersionInfo();
    const knownPhases = [
      'phase18-production-platform',
      'phase20-production-cutover',
      'remediation-complete',
    ];
    const phase = typeof version.phase === 'string' ? version.phase : '';
    const runtimeCompatibility = knownPhases.includes(phase);

    const valid = configSnapshot && schemaCompatibility && runtimeCompatibility;

    const result: RestoreValidationResult = {
      valid,
      ts,
      checks: {
        configSnapshot,
        schemaCompatibility,
        runtimeCompatibility,
      },
      detail: valid ? 'Restore validation passed (no data modified)' : 'Restore validation failed',
    };

    await this.redis.setex(PRODUCTION_REDIS_KEYS.restoreValidation, 3600, JSON.stringify(result));
    return result;
  }
}
