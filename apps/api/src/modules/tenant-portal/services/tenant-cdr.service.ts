import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantCdrService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    params: { from?: string; to?: string; limit?: number },
  ) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (params.from || params.to) {
      where.startedAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    return this.prisma.callSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: Math.min(params.limit ?? 100, 500),
      select: {
        id: true,
        publicId: true,
        platformUuid: true,
        callType: true,
        state: true,
        fromLineId: true,
        toLineId: true,
        phoneNumberId: true,
        queueId: true,
        ivrId: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        createdAt: true,
      },
    });
  }
}
