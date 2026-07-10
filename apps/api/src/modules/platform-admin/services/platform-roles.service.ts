import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type RoleRecord = {
  id: string;
  publicId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  description: string | null;
  systemRole: boolean;
  permissionCount: number;
};

export type PermissionRecord = {
  id: string;
  publicId: string;
  tenantId: string;
  tenantName: string;
  key: string;
  description: string | null;
};

@Injectable()
export class PlatformRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(tenantId?: string): Promise<RoleRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.role.findMany({
      where: { deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: {
        tenant: { select: { name: true } },
        _count: { select: { permissions: { where: { deletedAt: null } } } },
      },
      orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
    });

    return rows.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      name: r.name,
      description: r.description,
      systemRole: r.systemRole,
      permissionCount: r._count.permissions,
    }));
  }

  async listPermissions(tenantId?: string): Promise<PermissionRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.permission.findMany({
      where: { deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: { tenant: { select: { name: true } } },
      orderBy: [{ tenant: { name: 'asc' } }, { key: 'asc' }],
      take: 1000,
    });

    return rows.map((p) => ({
      id: p.id,
      publicId: p.publicId,
      tenantId: p.tenantId,
      tenantName: p.tenant.name,
      key: p.key,
      description: p.description,
    }));
  }
}
