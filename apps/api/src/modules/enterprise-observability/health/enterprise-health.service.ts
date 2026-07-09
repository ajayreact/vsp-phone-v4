import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tcpProbe, udpProbe } from '../../../common/health/tcp-probe';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { CarrierService } from '../../carrier/carrier.service';
import { MetricsService } from '../metrics/metrics.service';

export interface HealthCheckResult {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  version?: string;
  lastSuccessfulCheck?: string;
  failureReason?: string;
}

/** Phase 15 — detailed component health probes. */
@Injectable()
export class EnterpriseHealthService {
  private lastSuccess: Record<string, string> = {};

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly carriers: CarrierService,
    private readonly metrics: MetricsService,
  ) {}

  async checkApi(): Promise<HealthCheckResult> {
    return this.ok('api', { version: 'remediation-complete' });
  }

  async checkPostgres(): Promise<HealthCheckResult> {
    const started = Date.now();
    if (!this.prisma.connected) {
      return this.fail('postgres', 'not connected');
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - started;
      this.metrics.recordPostgresLatency(latencyMs);
      return this.ok('postgres', { latencyMs });
    } catch (err) {
      return this.fail('postgres', err instanceof Error ? err.message : String(err));
    }
  }

  async checkRedis(): Promise<HealthCheckResult> {
    const started = Date.now();
    if (!this.redis.isAvailable()) {
      return this.fail('redis', 'unavailable');
    }
    const pong = await this.redis.ping();
    const latencyMs = Date.now() - started;
    this.metrics.recordRedisLatency(latencyMs);
    if (pong !== 'PONG') return this.fail('redis', 'ping failed');
    return this.ok('redis', { latencyMs });
  }

  async checkKamailio(): Promise<HealthCheckResult> {
    const port = Number(this.config.get('KAMAILIO_HTTP_PORT') ?? '8880');
    const host = this.config.get('KAMAILIO_HTTP_HOST') ?? 'localhost';
    const started = Date.now();
    const tcp = await this.tcpCheck(host, port);
    if (tcp.status === 'down') return this.fail('kamailio', tcp.failureReason);
    return this.ok('kamailio', { latencyMs: Date.now() - started, version: 'phase3+' });
  }

  async checkRtpengine(): Promise<HealthCheckResult> {
    const port = Number(this.config.get('RTPENGINE_NG_PORT') ?? '2223');
    const host = this.config.get('RTPENGINE_HOST') ?? 'localhost';
    const started = Date.now();
    const probe = await udpProbe(host, port);
    if (probe.status === 'down') return this.fail('rtpengine', probe.detail);
    return this.ok('rtpengine', { latencyMs: Date.now() - started, version: 'phase4+' });
  }

  async checkTelnyx(): Promise<HealthCheckResult> {
    try {
      const h = await this.carriers.health();
      const status =
        h.status === 'GREEN' ? 'up' : h.status === 'YELLOW' ? ('degraded' as const) : ('down' as const);
      if (status === 'up') this.lastSuccess.telnyx = new Date().toISOString();
      return {
        status,
        version: h.provider,
        lastSuccessfulCheck: this.lastSuccess.telnyx,
        failureReason: status !== 'up' ? `carrier ${h.status}` : undefined,
      };
    } catch (err) {
      return this.fail('telnyx', err instanceof Error ? err.message : String(err));
    }
  }

  async checkAll(): Promise<Record<string, HealthCheckResult>> {
    const [api, postgres, redis, kamailio, rtpengine, telnyx] = await Promise.all([
      this.checkApi(),
      this.checkPostgres(),
      this.checkRedis(),
      this.checkKamailio(),
      this.checkRtpengine(),
      this.checkTelnyx(),
    ]);
    return { api, postgres, redis, kamailio, rtpengine, telnyx };
  }

  private ok(component: string, extra: Partial<HealthCheckResult>): HealthCheckResult {
    this.lastSuccess[component] = new Date().toISOString();
    return {
      status: 'up',
      lastSuccessfulCheck: this.lastSuccess[component],
      ...extra,
    };
  }

  private fail(component: string, reason: string): HealthCheckResult {
    return {
      status: 'down',
      failureReason: reason,
      lastSuccessfulCheck: this.lastSuccess[component],
    };
  }

  private async tcpCheck(host: string, port: number, timeoutMs = 1500): Promise<HealthCheckResult> {
    const result = await tcpProbe(host, port, timeoutMs);
    if (result.status === 'down') {
      return { status: 'down', failureReason: result.detail };
    }
    return { status: 'up', latencyMs: result.latencyMs };
  }
}
