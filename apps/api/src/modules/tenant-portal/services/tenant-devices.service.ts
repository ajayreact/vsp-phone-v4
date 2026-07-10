import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    return this.prisma.device.findMany({
      where,
      include: {
        line: { select: { id: true, name: true } },
        sipEndpoint: { select: { id: true, registrationStatus: true, lastRegisteredAt: true } },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }
}
