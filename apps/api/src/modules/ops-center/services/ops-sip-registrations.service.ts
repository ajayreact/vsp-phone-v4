import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';

@Injectable()
export class OpsSipRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { tenantId?: string; limit?: number }) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = { deletedAt: null };
    if (params.tenantId) where.tenantId = params.tenantId;

    const rows = await this.prisma.sIPEndpoint.findMany({
      where,
      orderBy: { lastRegisteredAt: 'desc' },
      take: Math.min(params.limit ?? 500, 500),
      select: {
        id: true,
        publicId: true,
        tenantId: true,
        aor: true,
        authUsername: true,
        registrationStatus: true,
        lastRegisteredAt: true,
        registrationConfig: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return rows.map((r) => ({
      ...r,
      lastRegisteredAt: r.lastRegisteredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
