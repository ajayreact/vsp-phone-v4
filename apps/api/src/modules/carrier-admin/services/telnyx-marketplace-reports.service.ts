import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelnyxNumbersService } from './telnyx-numbers.service';

@Injectable()
export class TelnyxMarketplaceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: TelnyxNumbersService,
  ) {}

  async getPlatformReports() {
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      expiredRequests,
      assignedRequests,
      purchasedRequests,
      cancelledRequests,
      activeReservations,
      dashboard,
    ] = await Promise.all([
      this.prisma.connected ? this.prisma.numberRequest.count() : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'PENDING' } }) : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'APPROVED' } }) : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'REJECTED' } }) : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'EXPIRED' } }) : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'ASSIGNED' } }) : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'PURCHASED' } }) : 0,
      this.prisma.connected ? this.prisma.numberRequest.count({ where: { status: 'CANCELLED' } }) : 0,
      this.prisma.connected
        ? this.prisma.numberReservation.count({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() } } })
        : 0,
      this.numbers.getDashboard(),
    ]);

    const recentAssigned = this.prisma.connected
      ? await this.prisma.numberRequest.findMany({
          where: { status: 'ASSIGNED' },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          include: { tenant: { select: { displayName: true, name: true } } },
        })
      : [];

    const approvalTimes: number[] = [];
    if (this.prisma.connected) {
      const reviewed = await this.prisma.numberRequest.findMany({
        where: { reviewedBy: { not: null }, status: { in: ['ASSIGNED', 'APPROVED', 'REJECTED', 'PURCHASED'] } },
        select: { createdAt: true, updatedAt: true },
        take: 200,
      });
      for (const r of reviewed) {
        approvalTimes.push(r.updatedAt.getTime() - r.createdAt.getTime());
      }
    }

    const avgApprovalMs =
      approvalTimes.length > 0
        ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length
        : 0;

    const tenantUsage = this.prisma.connected
      ? await this.prisma.phoneNumber.groupBy({
          by: ['tenantId'],
          where: { deletedAt: null },
          _count: { id: true },
        })
      : [];

    const tenantNames = new Map<string, string>();
    if (tenantUsage.length) {
      const tenants = await this.prisma.tenant.findMany({
        where: { id: { in: tenantUsage.map((t) => t.tenantId) } },
        select: { id: true, displayName: true, name: true },
      });
      for (const t of tenants) tenantNames.set(t.id, t.displayName || t.name);
    }

    return {
      requests: {
        total: totalRequests,
        pending: pendingRequests,
        approved: approvedRequests,
        rejected: rejectedRequests,
        expired: expiredRequests,
        assigned: assignedRequests,
        purchased: purchasedRequests,
        cancelled: cancelledRequests,
      },
      inventory: dashboard,
      reservedInventory: activeReservations,
      avgApprovalHours: Math.round((avgApprovalMs / (1000 * 60 * 60)) * 10) / 10,
      assignmentStatistics: {
        recentlyAssigned: recentAssigned.map((r) => ({
          id: r.id,
          phoneNumber: r.phoneNumber,
          tenantName: r.tenant.displayName || r.tenant.name,
          assignedAt: r.updatedAt.toISOString(),
        })),
      },
      tenantUsage: tenantUsage.map((t) => ({
        tenantId: t.tenantId,
        tenantName: tenantNames.get(t.tenantId) ?? t.tenantId,
        assignedNumbers: t._count.id,
      })),
    };
  }
}
