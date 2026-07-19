import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { tcpProbe, udpProbe } from '../../../common/health/tcp-probe';
import {
  fetchRemoteTlsCertificate,
  shortIssuerLabel,
} from '../../../common/health/tls-cert-probe';
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
  message?: string;
  /** Optional structured probe details (e.g. SSL CN/SAN/expiry). */
  details?: Record<string, string | number | string[] | undefined>;
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

  async checkProvisioning(): Promise<HealthCheckResult> {
    const port = Number(this.config.get('PROV_HTTPS_PORT') ?? '3444');
    const host = this.config.get('PROV_HEALTH_HOST') ?? '127.0.0.1';
    const started = Date.now();
    const tcp = await this.tcpCheck(host, port);
    if (tcp.status === 'down') return this.fail('provisioning', tcp.failureReason ?? 'unreachable');
    return this.ok('provisioning', { latencyMs: Date.now() - started, message: `port ${port}` });
  }

  checkDocker(): HealthCheckResult {
    try {
      if (fs.existsSync('/.dockerenv') || Boolean(process.env.DOCKER) || Boolean(process.env.KUBERNETES_SERVICE_HOST)) {
        return this.ok('docker', { message: 'container runtime detected' });
      }
      return { status: 'degraded', message: 'not running in container', lastSuccessfulCheck: this.lastSuccess.docker };
    } catch (err) {
      return this.fail('docker', err instanceof Error ? err.message : String(err));
    }
  }

  async checkNginx(): Promise<HealthCheckResult> {
    const port = Number(this.config.get('NGINX_HEALTH_PORT') ?? '443');
    const started = Date.now();
    const hosts = this.nginxHealthHosts();
    let lastFailure = 'unreachable';

    for (const host of hosts) {
      const tcp = await this.tcpCheck(host, port, 2000);
      if (tcp.status === 'up') {
        return this.ok('nginx', {
          latencyMs: Date.now() - started,
          message: `${host}:${port}`,
        });
      }
      lastFailure = tcp.failureReason ?? lastFailure;

      const http = await this.tcpCheck(host, 80, 1500);
      if (http.status === 'up') {
        return this.ok('nginx', {
          latencyMs: Date.now() - started,
          message: `${host}:80`,
        });
      }
      lastFailure = http.failureReason ?? lastFailure;
    }

    return this.fail('nginx', lastFailure);
  }

  /**
   * Live TLS inspection of the certificate served on SSL_HEALTH_HOST
   * (default prov.vspphone.com). Does not check development PEM paths.
   */
  async checkSsl(): Promise<HealthCheckResult> {
    const host =
      (this.config.get<string>('SSL_HEALTH_HOST') || '').trim() || 'prov.vspphone.com';
    const port = Number(this.config.get('SSL_HEALTH_PORT') ?? '443');

    try {
      const cert = await fetchRemoteTlsCertificate(host, port, 5000);
      const issuerLabel = shortIssuerLabel(cert.issuerOrg, cert.issuer);
      const days = cert.daysRemaining;
      const sanPreview = cert.san.length ? cert.san.slice(0, 3).join(', ') : cert.cn;

      const details = {
        cn: cert.cn,
        san: cert.san,
        issuer: cert.issuer,
        issuerOrg: issuerLabel,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        daysRemaining: days,
        host: `${host}:${port}`,
        sanPreview,
      };

      if (days < 0) {
        return {
          status: 'down',
          version: issuerLabel,
          message: `Expired ${Math.abs(days)} days ago`,
          failureReason: `${issuerLabel} expired (CN=${cert.cn})`,
          latencyMs: cert.latencyMs,
          lastSuccessfulCheck: this.lastSuccess.ssl,
          details,
        };
      }

      const message = `Expires in ${days} days`;

      if (days < 14) {
        return {
          status: 'degraded',
          version: issuerLabel,
          message,
          latencyMs: cert.latencyMs,
          lastSuccessfulCheck: new Date().toISOString(),
          failureReason: `certificate expires in ${days} days`,
          details,
        };
      }

      this.lastSuccess.ssl = new Date().toISOString();
      return {
        status: 'up',
        version: issuerLabel,
        message,
        latencyMs: cert.latencyMs,
        lastSuccessfulCheck: this.lastSuccess.ssl,
        details,
      };
    } catch (err) {
      return this.fail('ssl', err instanceof Error ? err.message : String(err));
    }
  }

  /** Prefer host gateway from Docker; never assume host nginx is on container loopback. */
  private nginxHealthHosts(): string[] {
    const configured = (this.config.get<string>('NGINX_HEALTH_HOST') || '').trim();
    const publicHost = (this.config.get<string>('NGINX_PUBLIC_HOST') || '').trim();
    const inDocker = this.isRunningInDocker();

    const hosts: string[] = [];
    const push = (h?: string) => {
      if (h && !hosts.includes(h)) hosts.push(h);
    };

    push(configured);
    if (inDocker) {
      push('host.docker.internal');
      // Docker bridge gateway (Linux) — common when host.docker.internal is unset.
      push('172.17.0.1');
    } else {
      push('127.0.0.1');
    }
    push(publicHost || 'admin.vspphone.com');
    return hosts;
  }

  private isRunningInDocker(): boolean {
    return (
      fs.existsSync('/.dockerenv') ||
      Boolean(process.env.DOCKER) ||
      Boolean(process.env.KUBERNETES_SERVICE_HOST)
    );
  }

  checkDisk(): HealthCheckResult {
    try {
      const stat = fs.statfsSync?.(process.cwd());
      if (!stat) {
        return this.ok('disk', { message: 'statfs unavailable' });
      }
      const total = Number(stat.blocks) * Number(stat.bsize);
      const free = Number(stat.bavail) * Number(stat.bsize);
      const usedPct = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
      if (usedPct >= 95) return this.fail('disk', `${usedPct}% used`);
      if (usedPct >= 85) {
        return { status: 'degraded', message: `${usedPct}% used`, lastSuccessfulCheck: new Date().toISOString() };
      }
      return this.ok('disk', { message: `${usedPct}% used` });
    } catch {
      return this.ok('disk', { message: 'ok' });
    }
  }

  checkMemory(): HealthCheckResult {
    const total = os.totalmem();
    const free = os.freemem();
    const usedPct = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
    if (usedPct >= 95) return this.fail('memory', `${usedPct}% used`);
    if (usedPct >= 90) {
      return { status: 'degraded', message: `${usedPct}% used`, lastSuccessfulCheck: new Date().toISOString() };
    }
    return this.ok('memory', { message: `${usedPct}% used` });
  }

  checkCpu(): HealthCheckResult {
    const load = os.loadavg()[0] ?? 0;
    const cores = os.cpus()?.length || 1;
    const ratio = load / cores;
    if (ratio >= 2) return this.fail('cpu', `load ${load.toFixed(2)} / ${cores} cores`);
    if (ratio >= 1.2) {
      return {
        status: 'degraded',
        message: `load ${load.toFixed(2)} / ${cores} cores`,
        lastSuccessfulCheck: new Date().toISOString(),
      };
    }
    return this.ok('cpu', { message: `load ${load.toFixed(2)} / ${cores} cores` });
  }

  checkUptime(): HealthCheckResult {
    const seconds = Math.floor(process.uptime());
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return this.ok('uptime', { message: `${hours}h ${mins}m`, version: String(seconds) });
  }

  checkVersion(): HealthCheckResult {
    const version =
      this.config.get<string>('APP_VERSION') ||
      process.env.npm_package_version ||
      '4.0.0-rc1';
    return this.ok('version', { version, message: version });
  }

  async checkAll(): Promise<Record<string, HealthCheckResult>> {
    const [
      api,
      postgres,
      redis,
      kamailio,
      rtpengine,
      provisioning,
      telnyx,
      nginx,
      ssl,
    ] = await Promise.all([
      this.checkApi(),
      this.checkPostgres(),
      this.checkRedis(),
      this.checkKamailio(),
      this.checkRtpengine(),
      this.checkProvisioning(),
      this.checkTelnyx(),
      this.checkNginx(),
      this.checkSsl(),
    ]);
    return {
      api,
      database: postgres,
      postgres,
      redis,
      kamailio,
      rtpengine,
      provisioning,
      carrier: telnyx,
      telnyx,
      docker: this.checkDocker(),
      nginx,
      ssl,
      disk: this.checkDisk(),
      memory: this.checkMemory(),
      cpu: this.checkCpu(),
      uptime: this.checkUptime(),
      version: this.checkVersion(),
    };
  }

  async checkAllExtended(minio?: HealthCheckResult): Promise<Record<string, HealthCheckResult & Record<string, unknown>>> {
    const base = await this.checkAll();
    const [redisDetail, postgresDetail] = await Promise.all([
      this.checkRedisDetailed(),
      this.checkPostgresDetailed(),
    ]);
    const result: Record<string, HealthCheckResult & Record<string, unknown>> = {
      api: { ...base.api },
      postgres: { ...base.postgres, ...postgresDetail },
      redis: { ...base.redis, ...redisDetail },
      kamailio: { ...base.kamailio },
      rtpengine: { ...base.rtpengine },
      telnyx: { ...base.telnyx },
    };
    if (minio) {
      result.minio = { ...minio };
    }
    return result;
  }

  async checkRedisDetailed(): Promise<Record<string, unknown>> {
    if (!this.redis.isAvailable()) return { connectedClients: 0, usedMemory: null };
    try {
      const info = await this.redis.info('memory');
      if (!info) return {};
      const usedMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const clientsMatch = info.match(/connected_clients:(\d+)/);
      return {
        usedMemory: usedMatch?.[1]?.trim() ?? null,
        connectedClients: clientsMatch ? Number(clientsMatch[1]) : null,
      };
    } catch {
      return {};
    }
  }

  async checkPostgresDetailed(): Promise<Record<string, unknown>> {
    if (!this.prisma.connected) return { poolSize: null };
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()`;
      return { activeConnections: Number(rows[0]?.count ?? 0) };
    } catch {
      return {};
    }
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
