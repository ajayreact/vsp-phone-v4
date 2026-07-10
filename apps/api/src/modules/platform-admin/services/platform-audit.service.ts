import { Injectable } from '@nestjs/common';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import type { AuditEntry } from '../../enterprise-observability/logging/logging.types';
import { PrismaService } from '../../telecom/prisma/prisma.service';

@Injectable()
export class PlatformAuditService {
  constructor(
    private readonly audit: EnterpriseAuditService,
    private readonly prisma: PrismaService,
  ) {}

  async query(params: {
    tenantId?: string;
    limit?: number;
    actionPrefix?: string;
  }): Promise<AuditEntry[]> {
    const limit = Math.min(params.limit ?? 50, 200);

    if (params.tenantId) {
      return this.audit.query({
        tenantId: params.tenantId,
        limit,
        actionPrefix: params.actionPrefix,
      });
    }

    if (!this.prisma.connected) return [];

    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
      take: 100,
    });

    const perTenantLimit = Math.max(1, Math.ceil(limit / Math.max(tenants.length, 1)));
    const batches = await Promise.all(
      tenants.map((t) =>
        this.audit.query({
          tenantId: t.id,
          limit: perTenantLimit,
          actionPrefix: params.actionPrefix,
        }),
      ),
    );

    return batches
      .flat()
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, limit);
  }
}
