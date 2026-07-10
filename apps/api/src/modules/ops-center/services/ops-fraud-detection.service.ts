import { Injectable } from '@nestjs/common';
import { CallType } from '@prisma/client';
import { MetricsRegistryService } from '../../enterprise-observability/metrics/metrics-registry.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

export type FraudSignal = {
  id: string;
  type: string;
  severity: 'critical' | 'major' | 'minor';
  title: string;
  detail: string;
  detectedAt: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class OpsFraudDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async scan(tenantId?: string): Promise<{ signals: FraudSignal[]; scannedAt: string }> {
    const signals: FraudSignal[] = [];
    const now = new Date().toISOString();

    const cps = await this.estimateCps(tenantId);
    if (cps > 50) {
      signals.push(this.signal('high_cps', 'major', 'High CPS detected', `Calls per second ${cps}`, { cps }));
    }
    if (cps > 200) {
      signals.push(this.signal('call_flood', 'critical', 'Call flood detected', `CPS ${cps} exceeds flood threshold`, { cps }));
    }

    const intlCalls = await this.countRecentInternational(tenantId);
    if (intlCalls > 20) {
      signals.push(
        this.signal('international_fraud', 'major', 'International fraud pattern', `${intlCalls} international calls in window`, {
          count: intlCalls,
        }),
      );
    }

    const authFailures = await this.countAuthFailures();
    if (authFailures > 100) {
      signals.push(
        this.signal('registration_attack', 'critical', 'Registration attack', `${authFailures} auth failures`, {
          failures: authFailures,
        }),
      );
    }
    if (authFailures > 30) {
      signals.push(
        this.signal('brute_force', 'major', 'Brute force SIP auth', `${authFailures} failed auth attempts`, { failures: authFailures }),
      );
    }

    const blacklistIps = await this.getBlacklistedIps();
    for (const ip of blacklistIps.slice(0, 10)) {
      signals.push(this.signal('blacklisted_ip', 'minor', 'Blacklisted IP activity', ip, { ip }));
    }

    if (signals.length) {
      await this.redis.setex('vsp:ops:fraud:last_scan', 3600, JSON.stringify({ signals, scannedAt: now }));
    }

    return { signals, scannedAt: now };
  }

  private signal(type: string, severity: FraudSignal['severity'], title: string, detail: string, metadata?: Record<string, unknown>): FraudSignal {
    return {
      id: `${type}-${Date.now()}`,
      type,
      severity,
      title,
      detail,
      detectedAt: new Date().toISOString(),
      metadata,
    };
  }

  private async estimateCps(tenantId?: string): Promise<number> {
    const label = tenantId ? `{tenantId="${tenantId}"}` : '';
    const prom = this.metrics.renderPrometheus();
    const match = prom.match(new RegExp(`vsp_calls_per_second${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ([\\d.]+)`));
    return match ? Number(match[1]) : 0;
  }

  private async countRecentInternational(tenantId?: string): Promise<number> {
    if (!this.prisma.connected) return 0;
    const since = new Date(Date.now() - 3600_000);
    return this.prisma.callSession.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        startedAt: { gte: since },
        callType: CallType.OUTBOUND_PSTN,
      },
    });
  }

  private async countAuthFailures(): Promise<number> {
    const keys = await this.redis.scanKeys('vsp:security:auth:failures:*', 500);
    let total = 0;
    for (const key of keys) {
      const val = await this.redis.get(key);
      total += Number(val ?? 0);
    }
    return total;
  }

  private async getBlacklistedIps(): Promise<string[]> {
    const keys = await this.redis.scanKeys('vsp:security:block:ip:*', 100);
    return keys.map((k) => k.replace('vsp:security:block:ip:', ''));
  }
}
