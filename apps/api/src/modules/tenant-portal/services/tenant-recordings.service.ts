import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantRecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, params: { callSessionId?: string; limit?: number }) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (params.callSessionId) where.callSessionId = params.callSessionId;

    return this.prisma.recording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.limit ?? 100, 500),
      select: {
        id: true,
        publicId: true,
        callSessionId: true,
        lineId: true,
        status: true,
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
        mediaObjectKey: true,
        createdAt: true,
      },
    });
  }
}
