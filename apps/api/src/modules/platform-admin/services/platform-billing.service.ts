import { Injectable } from '@nestjs/common';
import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type BillingSummary = {
  mrrCents: number;
  carrierCostCents: number;
  grossMarginCents: number;
  activeSubscriptions: number;
  totalInvoices: number;
  unpaidInvoices: number;
  currency: string;
};

export type PlanRecord = {
  id: string;
  publicId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  seatLimit: number;
  didLimit: number;
  active: boolean;
};

export type SubscriptionRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planName: string;
  status: string;
  startedAt: string;
  endsAt: string | null;
};

export type InvoiceRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  status: string;
  totalCents: number;
  currency: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

@Injectable()
export class PlatformBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<BillingSummary> {
    if (!this.prisma.connected) {
      return {
        mrrCents: 0,
        carrierCostCents: 0,
        grossMarginCents: 0,
        activeSubscriptions: 0,
        totalInvoices: 0,
        unpaidInvoices: 0,
        currency: 'USD',
      };
    }

    const [billingAgg, activeSubscriptions, totalInvoices, unpaidInvoices] = await Promise.all([
      this.prisma.billingAccount.aggregate({
        _sum: { mrrCents: true, carrierCostCents: true },
      }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.invoice.count(),
      this.prisma.invoice.count({
        where: { status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.OPEN] } },
      }),
    ]);

    const mrrCents = billingAgg._sum.mrrCents ?? 0;
    const carrierCostCents = billingAgg._sum.carrierCostCents ?? 0;

    return {
      mrrCents,
      carrierCostCents,
      grossMarginCents: mrrCents - carrierCostCents,
      activeSubscriptions,
      totalInvoices,
      unpaidInvoices,
      currency: 'USD',
    };
  }

  async listPlans(): Promise<PlanRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.plan.findMany({
      orderBy: { name: 'asc' },
    });

    return rows.map((p) => ({
      id: p.id,
      publicId: p.publicId,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      currency: p.currency,
      seatLimit: p.seatLimit,
      didLimit: p.didLimit,
      active: p.active,
    }));
  }

  async listSubscriptions(tenantId?: string): Promise<SubscriptionRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.subscription.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        tenant: { select: { name: true } },
        plan: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return rows.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      tenantName: s.tenant.name,
      planId: s.planId,
      planName: s.plan.name,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
    }));
  }

  async listInvoices(tenantId?: string): Promise<InvoiceRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.invoice.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return rows.map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      tenantName: i.tenant.name,
      status: i.status,
      totalCents: i.totalCents,
      currency: i.currency,
      dueAt: i.dueAt?.toISOString() ?? null,
      paidAt: i.paidAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    }));
  }
}
