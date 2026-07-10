import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteStatus, TenantStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../auth/password.util';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';
import { seedTenantRbac } from './tenant-rbac.seed';

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
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  timezone?: string;
  defaultLanguage?: string;
  siteName?: string;
};

export type OnboardTenantResult = {
  tenant: TenantRecord;
  adminUserId: string;
  siteId: string;
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
  constructor(private readonly prisma: PrismaService) {}

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

    const tenantId = randomUUID();
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

    const adminUserId = randomUUID();
    const siteId = randomUUID();
    const email = dto.adminEmail.trim().toLowerCase();

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id: tenantId,
          publicId,
          name,
          displayName,
          slug,
          status: TenantStatus.ACTIVE,
        },
      });

      await tx.tenantSettings.create({
        data: {
          id: randomUUID(),
          tenantId,
          timezone: dto.timezone?.trim() || 'America/New_York',
          defaultLanguage: dto.defaultLanguage?.trim() || 'en',
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
          code: slugFromName(dto.siteName?.trim() || 'main-office').slice(0, 32),
          status: SiteStatus.ACTIVE,
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
    });

    const tenant = await this.get(tenantId);
    return { tenant, adminUserId, siteId };
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
