import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type OrganizationRecord = {
  tenantId: string;
  name: string;
  displayName: string;
  slug: string;
  status: string;
  timezone: string | null;
  defaultLanguage: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  logoUrl: string | null;
  sites: Array<{
    id: string;
    name: string;
    status: string;
    postalCode: string | null;
    description: string | null;
    businessHours: string | null;
  }>;
};

export type UpdateOrganizationDto = {
  displayName?: string;
  timezone?: string;
  defaultLanguage?: string;
};

@Injectable()
export class PlatformOrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<OrganizationRecord> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: {
        settings: true,
        sites: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
      },
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
      sites: tenant.sites.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        postalCode: s.postalCode,
        description: s.description,
        businessHours: s.businessHours,
      })),
    };
  }

  async update(tenantId: string, dto: UpdateOrganizationDto): Promise<OrganizationRecord> {
    await this.get(tenantId);

    if (dto.displayName) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { displayName: dto.displayName.trim() },
      });
    }

    if (dto.timezone !== undefined || dto.defaultLanguage !== undefined) {
      const settings = await this.prisma.tenantSettings.findFirst({ where: { tenantId } });
      if (settings) {
        await this.prisma.tenantSettings.update({
          where: { id: settings.id },
          data: {
            ...(dto.timezone !== undefined ? { timezone: dto.timezone.trim() } : {}),
            ...(dto.defaultLanguage !== undefined ? { defaultLanguage: dto.defaultLanguage.trim() } : {}),
          },
        });
      }
    }

    return this.get(tenantId);
  }
}
