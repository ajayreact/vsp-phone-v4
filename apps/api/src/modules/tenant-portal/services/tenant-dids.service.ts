import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantDidsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.number = { contains: search.trim() };
    }

    return this.prisma.phoneNumber.findMany({
      where,
      include: {
        line: { select: { id: true, name: true } },
        carrier: { select: { id: true, name: true, code: true } },
      },
      orderBy: { number: 'asc' },
      take: 500,
    });
  }
}
