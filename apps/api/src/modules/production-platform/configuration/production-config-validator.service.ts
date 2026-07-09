import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tcpProbe, udpProbe } from '../../../common/health/tcp-probe';
import { KamailioPersistenceService } from '../../enterprise-ha/backup/kamailio-persistence.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { EnvironmentProfileService } from '../environment/environment-profile.service';

export interface ConfigValidationResult {
  ok: boolean;
  profile: string;
  errors: string[];
  warnings: string[];
}

/** Phase 18 — fail-fast production configuration validation at startup. */
@Injectable()
export class ProductionConfigValidatorService implements OnModuleInit {
  private readonly logger = new Logger(ProductionConfigValidatorService.name);
  private lastResult: ConfigValidationResult | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly envProfile: EnvironmentProfileService,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly kamailioPersistence: KamailioPersistenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    const result = await this.validate();
    this.lastResult = result;
    if (!result.ok) {
      const message = `Production configuration validation failed: ${result.errors.join('; ')}`;
      if (this.envProfile.profile === 'production') {
        throw new Error(message);
      }
      this.logger.warn(JSON.stringify({ event: 'production.config.validation_failed', ...result }));
    } else {
      this.logger.log(JSON.stringify({ event: 'production.config.validated', profile: result.profile }));
    }
  }

  getLastResult(): ConfigValidationResult | null {
    return this.lastResult;
  }

  async validate(): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const policy = this.envProfile.policy;

    if (policy.requireJwtSecret && !this.hasSecret('JWT_SECRET') && !this.hasSecret('DEV_JWT_SECRET')) {
      errors.push('JWT_SECRET is required');
    }
    if (policy.requireTelecomServiceAuth && !this.hasSecret('TELECOM_SERVICE_AUTH_TOKEN')) {
      errors.push('TELECOM_SERVICE_AUTH_TOKEN is required');
    }
    const kamAuth = this.kamailioPersistence.validateProduction();
    if (!kamAuth.ok) errors.push(...kamAuth.errors);
    if (this.envProfile.profile === 'production') {
      const enforceTelecom = this.config.get<boolean>('SECURITY_ENFORCE_TELECOM');
      if (enforceTelecom !== true) {
        errors.push('SECURITY_ENFORCE_TELECOM must be true in production');
      }
    }
    if (policy.requireTelnyxWebhook && !this.hasSecret('TELNYX_WEBHOOK_SECRET')) {
      errors.push('TELNYX_WEBHOOK_SECRET is required');
    }
    if (policy.requireTls && this.config.get<boolean>('TLS_ENABLED') !== true) {
      errors.push('TLS_ENABLED must be true');
    }
    if (policy.requireBackupLocation && !this.config.get<string>('BACKUP_LOCATION')?.trim()) {
      errors.push('BACKUP_LOCATION is required');
    }
    if (!this.config.get<string>('DATABASE_URL')?.trim()) {
      errors.push('DATABASE_URL is required');
    }
    if (!this.config.get<string>('REDIS_URL')?.trim()) {
      errors.push('REDIS_URL is required');
    }

    if (policy.probeInfrastructure) {
      if (!(await this.probePostgres())) errors.push('PostgreSQL connectivity check failed');
      if (!(await this.probeRedis())) errors.push('Redis connectivity check failed');
      if (!(await this.probeTcp(
        this.config.get('KAMAILIO_HTTP_HOST') ?? 'localhost',
        Number(this.config.get('KAMAILIO_HTTP_PORT') ?? '8880'),
      ))) {
        warnings.push('Kamailio connectivity check failed');
      }
      if (!(await this.probeUdp(
        this.config.get('RTPENGINE_HOST') ?? 'localhost',
        Number(this.config.get('RTPENGINE_NG_PORT') ?? '2223'),
      ))) {
        warnings.push('RTPengine connectivity check failed');
      }
    }

    const kamReport = this.kamailioPersistence.evaluate();
    if (
      this.envProfile.profile === 'production' &&
      kamReport.mode === 'memory'
    ) {
      warnings.push(
        'KAMAILIO_USRLOC_PERSISTENCE=memory — registrations lost on Kamailio restart',
      );
    }

    if (this.envProfile.profile === 'production' && warnings.length > 0) {
      errors.push(...warnings);
      warnings.length = 0;
    }

    return {
      ok: errors.length === 0,
      profile: this.envProfile.profile,
      errors,
      warnings,
    };
  }

  private hasSecret(key: string): boolean {
    return Boolean(this.config.get<string>(key)?.trim());
  }

  private async probePostgres(): Promise<boolean> {
    if (!this.prisma.connected) return false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async probeRedis(): Promise<boolean> {
    if (!this.redis.isAvailable()) return false;
    return (await this.redis.ping()) === 'PONG';
  }

  private async probeTcp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
    const result = await tcpProbe(host, port, timeoutMs);
    return result.status === 'up';
  }

  private async probeUdp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
    const result = await udpProbe(host, port, timeoutMs);
    return result.status === 'up';
  }
}
