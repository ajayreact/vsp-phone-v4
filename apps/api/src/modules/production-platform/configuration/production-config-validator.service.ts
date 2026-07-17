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

/** Temporary bootstrap diagnostics — log underlying probe failures (remove after production is stable). */
function redactDatabaseUrl(url: string | undefined): string {
  if (!url?.trim()) return '<unset>';
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

function parseDatabaseUrl(url: string | undefined): { host: string; port: string; database: string } {
  if (!url?.trim()) return { host: '<unset>', port: '<unset>', database: '<unset>' };
  try {
    const u = new URL(url);
    return {
      host: u.hostname || '<unset>',
      port: u.port || '5432',
      database: (u.pathname || '/').replace(/^\//, '').split('?')[0] || '<unset>',
    };
  } catch {
    return { host: '<parse-error>', port: '<parse-error>', database: '<parse-error>' };
  }
}

function errDetail(err: unknown): { message: string; stack?: string; code?: string } {
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: string; stack?: string; code?: string; name?: string };
    return {
      message: anyErr.message ?? String(err),
      stack: anyErr.stack,
      code: anyErr.code,
    };
  }
  return { message: String(err) };
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
    if (policy.requireTls) {
      const tlsEnabled =
        this.config.get<boolean>('TLS_ENABLED') === true ||
        String(this.config.get('TLS_ENABLED')).toLowerCase() === 'true';
      const termination = String(this.config.get('TLS_TERMINATION') ?? '')
        .toLowerCase()
        .trim();
      const edgeTls =
        termination === 'nginx' || termination === 'edge' || termination === 'external';
      if (!tlsEnabled && !edgeTls) {
        errors.push('TLS_ENABLED must be true, or TLS_TERMINATION=nginx|edge for edge HTTPS');
      }
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
      const pg = await this.probePostgres();
      if (!pg.ok) errors.push(pg.summary);

      const rd = await this.probeRedis();
      if (!rd.ok) errors.push(rd.summary);

      const kamHost = this.config.get('KAMAILIO_HTTP_HOST') ?? 'localhost';
      const kamPort = Number(this.config.get('KAMAILIO_HTTP_PORT') ?? '8880');
      const kam = await this.probeTcpLabeled('KAMAILIO', kamHost, kamPort, 2000);
      if (!kam.ok) warnings.push(kam.summary);

      const rtpHost = this.config.get('RTPENGINE_HOST') ?? 'localhost';
      const rtpPort = Number(this.config.get('RTPENGINE_NG_PORT') ?? '2223');
      const rtp = await this.probeUdpLabeled('RTPENGINE', rtpHost, rtpPort, 2000);
      if (!rtp.ok) warnings.push(rtp.summary);
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

  private async probePostgres(): Promise<{ ok: boolean; summary: string }> {
    const rawUrl = this.config.get<string>('DATABASE_URL');
    const parsed = parseDatabaseUrl(rawUrl);
    const timeoutMs = Number(this.config.get('DATABASE_CONNECT_TIMEOUT_MS') ?? '5000');
    const base = {
      probe: 'POSTGRES',
      databaseUrl: redactDatabaseUrl(rawUrl),
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      timeoutMs,
      prismaConnected: this.prisma.connected,
    };

    if (!this.prisma.connected) {
      const summary =
        `[POSTGRES] host=${parsed.host} port=${parsed.port} DB=${parsed.database} ` +
        `prisma.connected=false ERROR=Prisma did not establish a connection during onModuleInit ` +
        `(see telecom.prisma.connect_failed logs for P1000/P1001/etc)`;
      this.logger.error(JSON.stringify({ event: 'production.probe.postgres.failed', ...base, error: summary }));
      return { ok: false, summary };
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ ok: number; current_database: string; current_user: string }>>`
        SELECT 1 AS ok, current_database()::text AS current_database, current_user::text AS current_user
      `;
      const row = rows?.[0];
      this.logger.log(
        JSON.stringify({
          event: 'production.probe.postgres.ok',
          ...base,
          currentDatabase: row?.current_database,
          currentUser: row?.current_user,
        }),
      );
      return { ok: true, summary: 'PostgreSQL ok' };
    } catch (err) {
      const detail = errDetail(err);
      const summary =
        `[POSTGRES] host=${parsed.host} port=${parsed.port} DB=${parsed.database} ` +
        `prisma.connected=true ERROR=${detail.code ? `${detail.code} ` : ''}${detail.message}`;
      this.logger.error(
        JSON.stringify({
          event: 'production.probe.postgres.failed',
          ...base,
          error: detail.message,
          code: detail.code,
          stack: detail.stack,
        }),
      );
      return { ok: false, summary };
    }
  }

  private async probeRedis(): Promise<{ ok: boolean; summary: string }> {
    const redisUrl = this.config.get<string>('REDIS_URL') ?? '<unset>';
    const redacted = redisUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
    let host = '<unset>';
    let port = '<unset>';
    try {
      const u = new URL(redisUrl);
      host = u.hostname || '<unset>';
      port = u.port || '6379';
    } catch {
      /* ignore */
    }

    if (!this.redis.isAvailable()) {
      const summary = `[REDIS] host=${host} port=${port} ERROR=Redis client not available (isAvailable=false) url=${redacted}`;
      this.logger.error(JSON.stringify({ event: 'production.probe.redis.failed', host, port, redisUrl: redacted, error: summary }));
      return { ok: false, summary };
    }

    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        const summary = `[REDIS] host=${host} port=${port} ERROR=unexpected ping reply=${String(pong)}`;
        this.logger.error(JSON.stringify({ event: 'production.probe.redis.failed', host, port, error: summary }));
        return { ok: false, summary };
      }
      this.logger.log(JSON.stringify({ event: 'production.probe.redis.ok', host, port }));
      return { ok: true, summary: 'Redis ok' };
    } catch (err) {
      const detail = errDetail(err);
      const summary = `[REDIS] host=${host} port=${port} ERROR=${detail.message}`;
      this.logger.error(
        JSON.stringify({
          event: 'production.probe.redis.failed',
          host,
          port,
          error: detail.message,
          stack: detail.stack,
        }),
      );
      return { ok: false, summary };
    }
  }

  private async probeTcpLabeled(
    label: string,
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<{ ok: boolean; summary: string }> {
    const result = await tcpProbe(host, port, timeoutMs);
    if (result.status === 'up') {
      this.logger.log(
        JSON.stringify({
          event: `production.probe.${label.toLowerCase()}.ok`,
          host,
          port,
          timeoutMs,
          latencyMs: result.latencyMs,
        }),
      );
      return { ok: true, summary: `${label} ok` };
    }
    const error = result.detail ?? 'connection failed';
    const summary = `[${label}] Host=${host} Port=${port} timeoutMs=${timeoutMs} ERROR=${error}`;
    this.logger.error(
      JSON.stringify({
        event: `production.probe.${label.toLowerCase()}.failed`,
        host,
        port,
        timeoutMs,
        error,
        latencyMs: result.latencyMs,
      }),
    );
    return { ok: false, summary };
  }

  private async probeUdpLabeled(
    label: string,
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<{ ok: boolean; summary: string }> {
    const result = await udpProbe(host, port, timeoutMs);
    if (result.status === 'up') {
      this.logger.log(
        JSON.stringify({
          event: `production.probe.${label.toLowerCase()}.ok`,
          host,
          port,
          timeoutMs,
          latencyMs: result.latencyMs,
        }),
      );
      return { ok: true, summary: `${label} ok` };
    }
    const error =
      result.detail === 'timeout'
        ? 'Timeout waiting for NG reply'
        : (result.detail ?? 'UDP probe failed');
    const summary = `[${label}] Host=${host} Port=${port} timeoutMs=${timeoutMs} ERROR=${error}`;
    this.logger.error(
      JSON.stringify({
        event: `production.probe.${label.toLowerCase()}.failed`,
        host,
        port,
        timeoutMs,
        error,
        latencyMs: result.latencyMs,
      }),
    );
    return { ok: false, summary };
  }
}
