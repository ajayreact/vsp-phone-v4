import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SiteStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  CreateTenantDepartmentDto,
  CreateTenantSiteDto,
  UpdateTenantCompanyDto,
  UpdateTenantDepartmentDto,
  UpdateTenantSiteDto,
} from '../dto/tenant-organization.dto';
import { newPublicId, tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantOrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: { settings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      tenantId: tenant.id,
      name: tenant.name,
      displayName: tenant.displayName,
      slug: tenant.slug,
      status: tenant.status,
      timezone: tenant.settings?.timezone ?? null,
      defaultLanguage: tenant.settings?.defaultLanguage ?? null,
      businessEmail: tenant.settings?.businessEmail ?? null,
      businessPhone: tenant.settings?.businessPhone ?? null,
      website: tenant.settings?.website ?? null,
      industry: tenant.settings?.industry ?? null,
      companySize: tenant.settings?.companySize ?? null,
      logoUrl: tenant.settings?.logoUrl ?? null,
      brandPrimary: tenant.settings?.brandPrimary ?? null,
      brandSecondary: tenant.settings?.brandSecondary ?? null,
      defaultCallerId: tenant.settings?.defaultCallerId ?? null,
      emergencyNumber: tenant.settings?.emergencyNumber ?? null,
    };
  }

  async updateCompany(tenantId: string, actorUserId: string, dto: UpdateTenantCompanyDto) {
    await this.getCompany(tenantId);

    if (dto.displayName?.trim()) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { displayName: dto.displayName.trim() },
      });
    }

    const settingsFields = {
      timezone: dto.timezone?.trim(),
      defaultLanguage: dto.defaultLanguage?.trim(),
      businessEmail: dto.businessEmail?.trim(),
      businessPhone: dto.businessPhone?.trim(),
      website: dto.website?.trim(),
      industry: dto.industry?.trim(),
      companySize: dto.companySize?.trim(),
      brandPrimary: dto.brandPrimary?.trim(),
      brandSecondary: dto.brandSecondary?.trim(),
      defaultCallerId: dto.defaultCallerId?.trim(),
      emergencyNumber: dto.emergencyNumber?.trim(),
    };

    const hasSettings = Object.values(settingsFields).some((v) => v !== undefined);
    if (hasSettings) {
      const settings = await this.prisma.tenantSettings.findFirst({ where: { tenantId } });
      if (settings) {
        await this.prisma.tenantSettings.update({
          where: { id: settings.id },
          data: {
            ...(settingsFields.timezone !== undefined ? { timezone: settingsFields.timezone || null } : {}),
            ...(settingsFields.defaultLanguage !== undefined
              ? { defaultLanguage: settingsFields.defaultLanguage || null }
              : {}),
            ...(settingsFields.businessEmail !== undefined
              ? { businessEmail: settingsFields.businessEmail || null }
              : {}),
            ...(settingsFields.businessPhone !== undefined
              ? { businessPhone: settingsFields.businessPhone || null }
              : {}),
            ...(settingsFields.website !== undefined ? { website: settingsFields.website || null } : {}),
            ...(settingsFields.industry !== undefined ? { industry: settingsFields.industry || null } : {}),
            ...(settingsFields.companySize !== undefined
              ? { companySize: settingsFields.companySize || null }
              : {}),
            ...(settingsFields.brandPrimary !== undefined
              ? { brandPrimary: settingsFields.brandPrimary || null }
              : {}),
            ...(settingsFields.brandSecondary !== undefined
              ? { brandSecondary: settingsFields.brandSecondary || null }
              : {}),
            ...(settingsFields.defaultCallerId !== undefined
              ? { defaultCallerId: settingsFields.defaultCallerId || null }
              : {}),
            ...(settingsFields.emergencyNumber !== undefined
              ? { emergencyNumber: settingsFields.emergencyNumber || null }
              : {}),
            updatedBy: actorUserId,
          },
        });
      }
    }

    return this.getCompany(tenantId);
  }

  async listSites(tenantId: string, search?: string) {
    const where: Record<string, unknown> = { ...tenantScope(tenantId) };
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.site.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async createSite(tenantId: string, actorUserId: string, dto: CreateTenantSiteDto) {
    const code = dto.code.trim().toLowerCase();
    const dup = await this.prisma.site.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
    if (dup) throw new ConflictException('Site code already exists');

    const siteId = randomUUID();
    const site = await this.prisma.site.create({
      data: {
        id: siteId,
        publicId: newPublicId('site'),
        tenantId,
        name: dto.name.trim(),
        code,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        country: dto.country?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
        description: dto.description?.trim() || null,
        businessHours: dto.businessHours?.trim() || null,
        status: SiteStatus.ACTIVE,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });

    await this.prisma.siteSettings.create({
      data: {
        id: randomUUID(),
        tenantId,
        siteId,
        timezone: null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });

    return site;
  }

  async updateSite(tenantId: string, actorUserId: string, id: string, dto: UpdateTenantSiteDto) {
    const site = await this.prisma.site.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!site) throw new NotFoundException('Site not found');

    if (dto.code?.trim() && dto.code.trim().toLowerCase() !== site.code) {
      const dup = await this.prisma.site.findFirst({
        where: { tenantId, code: dto.code.trim().toLowerCase(), deletedAt: null, NOT: { id } },
      });
      if (dup) throw new ConflictException('Site code already exists');
    }

    return this.prisma.site.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim().toLowerCase() } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
        ...(dto.state !== undefined ? { state: dto.state?.trim() || null } : {}),
        ...(dto.country !== undefined ? { country: dto.country?.trim() || null } : {}),
        ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode?.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.businessHours !== undefined ? { businessHours: dto.businessHours?.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status as SiteStatus } : {}),
        updatedBy: actorUserId,
      },
    });
  }

  async deleteSite(tenantId: string, actorUserId: string, id: string) {
    const site = await this.prisma.site.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!site) throw new NotFoundException('Site not found');

    const deviceCount = await this.prisma.device.count({
      where: { siteId: id, tenantId, deletedAt: null },
    });
    if (deviceCount > 0) {
      throw new BadRequestException('Cannot delete site with assigned devices');
    }

    return this.prisma.site.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId, updatedBy: actorUserId },
    });
  }

  async listDepartments(tenantId: string, search?: string) {
    const where: Record<string, unknown> = { ...tenantScope(tenantId) };
    if (search?.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const rows = await this.prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
      include: { _count: { select: { devices: { where: { deletedAt: null } } } } },
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      deviceCount: r._count.devices,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async createDepartment(tenantId: string, dto: CreateTenantDepartmentDto) {
    const name = dto.name.trim();
    const dup = await this.prisma.department.findFirst({
      where: { tenantId, name, deletedAt: null },
    });
    if (dup) throw new ConflictException('Department name already exists');

    return this.prisma.department.create({
      data: { id: randomUUID(), tenantId, name },
    });
  }

  async updateDepartment(tenantId: string, id: string, dto: UpdateTenantDepartmentDto) {
    const row = await this.prisma.department.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Department not found');

    if (dto.name?.trim() && dto.name.trim() !== row.name) {
      const dup = await this.prisma.department.findFirst({
        where: { tenantId, name: dto.name.trim(), deletedAt: null, NOT: { id } },
      });
      if (dup) throw new ConflictException('Department name already exists');
    }

    return this.prisma.department.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) },
    });
  }

  async deleteDepartment(tenantId: string, id: string) {
    const row = await this.prisma.department.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Department not found');

    const deviceCount = await this.prisma.device.count({
      where: { departmentId: id, tenantId, deletedAt: null },
    });
    if (deviceCount > 0) {
      throw new BadRequestException('Cannot delete department with assigned devices');
    }

    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
