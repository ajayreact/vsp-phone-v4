import { Injectable } from '@nestjs/common';
import { CarrierType } from '@prisma/client';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type CarrierRecord = {
  id: string;
  publicId: string;
  tenantId: string | null;
  tenantName: string | null;
  name: string;
  code: string;
  carrierType: string;
  status: string;
  /** API connectivity */
  apiStatus: 'up' | 'down' | 'degraded' | 'unknown';
  /** Webhook configured / reachable summary */
  webhookStatus: 'configured' | 'missing' | 'unknown';
  numbersCount: number;
  trunksCount: number;
  lastSyncAt: string | null;
  healthStatus: 'up' | 'down' | 'degraded' | 'unknown';
};

@Injectable()
export class PlatformCarriersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: EnterpriseHealthService,
  ) {}

  async list(): Promise<CarrierRecord[]> {
    if (!this.prisma.connected) return [];

    const [rows, telnyxHealth, trunkCount] = await Promise.all([
      this.prisma.carrier.findMany({
        where: { deletedAt: null },
        include: { tenant: { select: { name: true } } },
        orderBy: [{ carrierType: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      }),
      this.health.checkTelnyx(),
      this.prisma.sIPEndpoint
        .count({
          where: { deletedAt: null, carrier: { carrierType: CarrierType.TELNYX, deletedAt: null } },
        })
        .catch(() => 0),
    ]);

    // One row per carrier type for platform integrations (Telnyx is platform-scoped).
    const byType = new Map<string, (typeof rows)[number]>();
    for (const c of rows) {
      if (c.carrierType === CarrierType.TELNYX) {
        if (!byType.has(CarrierType.TELNYX) || c.tenantId == null) {
          byType.set(CarrierType.TELNYX, c);
        }
        continue;
      }
      byType.set(`${c.carrierType}:${c.id}`, c);
    }

    const telnyx = byType.get(CarrierType.TELNYX);
    const numbersCount = telnyx
      ? await this.prisma.phoneNumber.count({
          where: { deletedAt: null, carrierId: telnyx.id },
        })
      : 0;

    const out: CarrierRecord[] = [];
    for (const c of byType.values()) {
      const cfg = (c.configuration ?? {}) as Record<string, unknown>;
      const sync = cfg.telnyxSync as { lastSyncAt?: string | null } | undefined;
      const webhookConfigured = Boolean(
        process.env.TELNYX_WEBHOOK_SECRET?.trim() || cfg.webhookUrl || cfg.webhookSecret,
      );

      out.push({
        id: c.id,
        publicId: c.publicId,
        tenantId: c.tenantId,
        tenantName: c.tenant?.name ?? null,
        name: c.name,
        code: c.code,
        carrierType: c.carrierType,
        status: c.status,
        apiStatus:
          c.carrierType === CarrierType.TELNYX ? telnyxHealth.status : ('unknown' as const),
        webhookStatus: webhookConfigured ? 'configured' : 'missing',
        numbersCount: c.carrierType === CarrierType.TELNYX ? numbersCount : 0,
        trunksCount: c.carrierType === CarrierType.TELNYX ? trunkCount : 0,
        lastSyncAt: sync?.lastSyncAt ?? null,
        healthStatus:
          c.carrierType === CarrierType.TELNYX ? telnyxHealth.status : ('unknown' as const),
      });
    }

    return out;
  }
}
