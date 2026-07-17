import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteStatus, SubscriptionStatus, TenantStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../auth/password.util';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';
import { seedTenantRbac } from './tenant-rbac.seed';
import { ensureDefaultBillingPlans, planDefaults } from './billing-plans.seed';

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'tenant', 'platform', 'www', 'ops', 'system', 'root',
  'login', 'dashboard', 'null', 'undefined', 'support', 'billing', 'help',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TenantRecord = {
  id: string;
  publicId: string;
  name: string;
  displayName: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateTenantDto = {
  name: string;
  displayName?: string;
  status?: TenantStatus;
};

export type UpdateTenantDto = {
  name?: string;
  displayName?: string;
  slug?: string;
  status?: TenantStatus;
};

export type OnboardTenantDto = {
  name: string;
  displayName?: string;
  slug?: string;
  businessEmail?: string;
  businessPhone?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  logoUrl?: string;
  timezone?: string;
  country?: string;
  state?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  currency?: string;
  defaultLanguage?: string;
  status?: TenantStatus;
  siteName?: string;
  siteCountry?: string;
  siteTimezone?: string;
  siteAddress?: string;
  siteLocationCode?: string;
  siteDescription?: string;
  businessHours?: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  adminUsername?: string;
  adminMobile?: string;
  adminJobTitle?: string;
  adminDepartment?: string;
  adminLanguage?: string;
  adminTimezone?: string;
  voicemailEnabled?: boolean;
  recordingEnabled?: boolean;
  musicOnHold?: boolean;
  planId: string;
  trial?: boolean;
  billingCycle?: string;
  maxExtensions?: number;
  maxUsers?: number;
  maxNumbers?: number;
  storageLimitGb?: number;
  recordingRetentionDays?: number;
};

export type OnboardTenantResult = {
  tenant: TenantRecord;
  adminUserId: string;
  siteId: string;
  subscriptionId: string;
};

function slugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'tenant';
}

@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(params: { search?: string; status?: TenantStatus }): Promise<TenantRecord[]> {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.tenant.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
    });

    return rows.map((t) => this.toRecord(t));
  }

  async get(id: string): Promise<TenantRecord> {
    const row = await this.findActive(id);
    return this.toRecord(row);
  }

  async create(dto: CreateTenantDto): Promise<TenantRecord> {
    if (!this.prisma.connected) {
      throw new ConflictException('Database unavailable');
    }

    const id = randomUUID();
    const name = dto.name.trim();
    const displayName = dto.displayName?.trim() ?? name;
    const slug = slugFromName(name);
    const publicId = newPublicId('t');

    const existing = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Tenant slug already exists: ${slug}`);
    }

    const row = await this.prisma.tenant.create({
      data: {
        id,
        publicId,
        name,
        displayName,
        slug,
        status: dto.status ?? TenantStatus.PENDING,
      },
    });

    return this.toRecord(row);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantRecord> {
    await this.findActive(id);

    if (dto.slug) {
      const conflict = await this.prisma.tenant.findFirst({
        where: { slug: dto.slug, deletedAt: null, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(`Tenant slug already exists: ${dto.slug}`);
      }
    }

    const row = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    return this.toRecord(row);
  }

  async onboard(dto: OnboardTenantDto, actorUserId?: string): Promise<OnboardTenantResult> {
    if (!this.prisma.connected) {
      throw new ConflictException('Database unavailable');
    }

    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Organization name is required');

    const displayName = dto.displayName?.trim() || name;
    const slug = slugFromName(dto.slug?.trim() || name);
    const email = dto.adminEmail?.trim().toLowerCase();

    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException(`Slug "${slug}" is reserved and cannot be used`);
    }
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('Admin email format is invalid');
    }
    if (!dto.adminPassword || dto.adminPassword.length < 8) {
      throw new BadRequestException('Admin password must be at least 8 characters');
    }

    const slugConflict = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (slugConflict) {
      throw new ConflictException(`A tenant with slug "${slug}" already exists`);
    }

    const orgConflict = await this.prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { displayName: { equals: displayName, mode: 'insensitive' } },
        ],
      },
    });
    if (orgConflict) {
      throw new ConflictException(`An organization named "${displayName}" already exists`);
    }

    const emailConflict = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (emailConflict) {
      throw new ConflictException(`The email "${email}" is already registered`);
    }

    if (!dto.planId?.trim()) {
      throw new BadRequestException('Billing plan is required');
    }

    await ensureDefaultBillingPlans(this.prisma);

    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId.trim() } });
    if (!plan?.active) {
      throw new BadRequestException('Selected billing plan is not available');
    }

    const limits = planDefaults(plan);
    const maxUsers = dto.maxUsers ?? limits.seatLimit;
    const maxNumbers = dto.maxNumbers ?? limits.didLimit;
    const maxExtensions = dto.maxExtensions ?? limits.maxExtensions;
    const storageLimitGb = dto.storageLimitGb ?? limits.storageLimitGb;
    const recordingRetentionDays = dto.recordingRetentionDays ?? limits.recordingRetentionDays;
    const billingCycle = dto.billingCycle?.trim() || 'monthly';

    const tenantId = randomUUID();
    const adminUserId = randomUUID();
    const siteId = randomUUID();
    const subscriptionId = randomUUID();
    const publicId = newPublicId('t');
    const siteCode = slugFromName(dto.siteLocationCode?.trim() || dto.siteName?.trim() || 'main-office').slice(0, 32);
    const timezone = dto.timezone?.trim() || dto.adminTimezone?.trim() || 'America/New_York';
    const siteTimezone = dto.siteTimezone?.trim() || timezone;
    const createdSubscriptionId = subscriptionId;

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id: tenantId,
          publicId,
          name,
          displayName,
          slug,
          status: dto.status ?? TenantStatus.ACTIVE,
        },
      });

      await tx.tenantSettings.create({
        data: {
          id: randomUUID(),
          tenantId,
          timezone,
          defaultLanguage: dto.defaultLanguage?.trim() || dto.adminLanguage?.trim() || 'en',
          businessEmail: dto.businessEmail?.trim() || null,
          businessPhone: dto.businessPhone?.trim() || null,
          website: dto.website?.trim() || null,
          industry: dto.industry?.trim() || null,
          companySize: dto.companySize?.trim() || null,
          logoUrl: dto.logoUrl?.trim() || null,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await tx.site.create({
        data: {
          id: siteId,
          publicId: newPublicId('site'),
          tenantId,
          name: dto.siteName?.trim() || 'Main Office',
          code: siteCode,
          address: dto.siteAddress?.trim() || dto.address?.trim() || null,
          city: dto.city?.trim() || null,
          state: dto.state?.trim() || null,
          country: dto.siteCountry?.trim() || dto.country?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          description: dto.siteDescription?.trim() || null,
          businessHours: dto.businessHours?.trim() || null,
          status: SiteStatus.ACTIVE,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await tx.siteSettings.create({
        data: {
          id: randomUUID(),
          tenantId,
          siteId,
          timezone: siteTimezone,
          emergencyAddress: dto.address?.trim() || null,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      const { adminRoleId } = await seedTenantRbac(tx, tenantId, actorUserId);

      await tx.user.create({
        data: {
          id: adminUserId,
          publicId: newPublicId('u'),
          tenantId,
          email,
          username: dto.adminUsername?.trim() || null,
          passwordHash: hashPassword(dto.adminPassword),
          status: UserStatus.ACTIVE,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await tx.userProfile.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId: adminUserId,
          firstName: dto.adminFirstName.trim(),
          lastName: dto.adminLastName.trim(),
          displayName: `${dto.adminFirstName.trim()} ${dto.adminLastName.trim()}`.trim(),
          mobile: dto.adminMobile?.trim() || null,
          jobTitle: dto.adminJobTitle?.trim() || null,
          department: dto.adminDepartment?.trim() || null,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await tx.userRole.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId: adminUserId,
          roleId: adminRoleId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await tx.userSite.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId: adminUserId,
          siteId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      const telephonyFeatures: Array<{ key: string; enabled: boolean }> = [
        { key: 'pbx.voicemail', enabled: dto.voicemailEnabled ?? true },
        { key: 'pbx.recording', enabled: dto.recordingEnabled ?? false },
        { key: 'pbx.moh', enabled: dto.musicOnHold ?? true },
      ];
      for (const f of telephonyFeatures) {
        await tx.tenantFeature.create({
          data: {
            id: randomUUID(),
            tenantId,
            featureKey: f.key,
            enabled: f.enabled,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      }

      await tx.subscription.create({
        data: {
          id: subscriptionId,
          tenantId,
          planId: plan.id,
          status: dto.trial ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
          billingCycle,
          maxUsers,
          maxExtensions,
          maxNumbers,
          storageLimitGb,
          recordingRetentionDays,
        },
      });

      await tx.billingAccount.create({
        data: {
          id: randomUUID(),
          tenantId,
          currency: dto.currency?.trim() || 'USD',
          mrrCents: dto.trial ? 0 : plan.priceCents,
        },
      });
    });

    await this.audit.append({
      tenantId,
      actorUserId: actorUserId ?? 'platform',
      actorType: 'admin',
      action: 'tenant.onboarded',
      resourceType: 'tenant',
      resourceId: tenantId,
      detail: {
        slug,
        publicId,
        siteId,
        adminUserId,
        subscriptionId: createdSubscriptionId,
        planId: plan.id,
        planName: plan.name,
        trial: dto.trial ?? false,
        billingCycle,
        maxUsers,
        maxExtensions,
        maxNumbers,
        storageLimitGb,
        recordingRetentionDays,
        logoUrl: dto.logoUrl,
      },
    });

    const tenant = await this.get(tenantId);
    return { tenant, adminUserId, siteId, subscriptionId: createdSubscriptionId };
  }

  async suspend(id: string): Promise<TenantRecord> {
    await this.findActive(id);
    const row = await this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.SUSPENDED },
    });
    return this.toRecord(row);
  }

  async activate(id: string): Promise<TenantRecord> {
    await this.findActive(id);
    const row = await this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.ACTIVE },
    });
    return this.toRecord(row);
  }

  async softDelete(id: string, deletedBy?: string): Promise<TenantRecord> {
    await this.findActive(id);
    const row = await this.prisma.tenant.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: deletedBy ?? null,
        status: TenantStatus.INACTIVE,
      },
    });
    return this.toRecord(row);
  }

  private async findActive(id: string) {
    if (!this.prisma.connected) {
      throw new NotFoundException('Tenant not found');
    }
    const row = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Tenant not found');
    return row;
  }

  private toRecord(t: {
    id: string;
    publicId: string;
    name: string;
    displayName: string;
    slug: string;
    status: TenantStatus;
    createdAt: Date;
    updatedAt: Date;
  }): TenantRecord {
    return {
      id: t.id,
      publicId: t.publicId,
      name: t.name,
      displayName: t.displayName,
      slug: t.slug,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
