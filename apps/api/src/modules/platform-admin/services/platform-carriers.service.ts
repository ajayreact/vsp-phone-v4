import { Injectable } from '@nestjs/common';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type CarrierRecord = {
  id: string;
  publicId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  code: string;
  carrierType: string;
  status: string;
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

    const [rows, telnyxHealth] = await Promise.all([
      this.prisma.carrier.findMany({
        where: { deletedAt: null },
        include: { tenant: { select: { name: true } } },
        orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
        take: 500,
      }),
      this.health.checkTelnyx(),
    ]);

    return rows.map((c) => ({
      id: c.id,
      publicId: c.publicId,
      tenantId: c.tenantId,
      tenantName: c.tenant.name,
      name: c.name,
      code: c.code,
      carrierType: c.carrierType,
      status: c.status,
      healthStatus:
        c.carrierType === 'TELNYX'
          ? telnyxHealth.status
          : ('unknown' as const),
    }));
  }
}
