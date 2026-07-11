import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';

export type DefaultPlanSeed = {
  name: string;
  description: string;
  priceCents: number;
  seatLimit: number;
  didLimit: number;
  storageLimitGb: number;
  recordingRetentionDays: number;
};

export const DEFAULT_BILLING_PLANS: DefaultPlanSeed[] = [
  {
    name: 'Starter',
    description: 'Small teams getting started with cloud PBX',
    priceCents: 2900,
    seatLimit: 10,
    didLimit: 5,
    storageLimitGb: 25,
    recordingRetentionDays: 30,
  },
  {
    name: 'Business',
    description: 'Growing businesses with multi-site needs',
    priceCents: 7900,
    seatLimit: 50,
    didLimit: 25,
    storageLimitGb: 50,
    recordingRetentionDays: 90,
  },
  {
    name: 'Professional',
    description: 'Advanced telephony for mid-market organizations',
    priceCents: 14900,
    seatLimit: 200,
    didLimit: 100,
    storageLimitGb: 200,
    recordingRetentionDays: 180,
  },
  {
    name: 'Enterprise',
    description: 'Large-scale deployments with premium limits',
    priceCents: 49900,
    seatLimit: 1000,
    didLimit: 500,
    storageLimitGb: 1000,
    recordingRetentionDays: 365,
  },
];

export async function ensureDefaultBillingPlans(prisma: PrismaClient): Promise<void> {
  for (const plan of DEFAULT_BILLING_PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) continue;

    await prisma.plan.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('plan'),
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        currency: 'USD',
        seatLimit: plan.seatLimit,
        didLimit: plan.didLimit,
        active: true,
      },
    });
  }
}

export function planDefaults(plan: {
  seatLimit: number;
  didLimit: number;
  name: string;
}): Pick<
  DefaultPlanSeed,
  'seatLimit' | 'didLimit' | 'storageLimitGb' | 'recordingRetentionDays'
> & { maxExtensions: number } {
  const seed = DEFAULT_BILLING_PLANS.find((p) => p.name === plan.name);
  return {
    seatLimit: plan.seatLimit,
    didLimit: plan.didLimit,
    maxExtensions: plan.seatLimit * 2,
    storageLimitGb: seed?.storageLimitGb ?? 50,
    recordingRetentionDays: seed?.recordingRetentionDays ?? 90,
  };
}
