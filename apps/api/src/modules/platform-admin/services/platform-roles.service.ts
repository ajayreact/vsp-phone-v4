import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';

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

export type CreateRoleDto = {
  tenantId: string;
  name: string;
  description?: string;
  permissionIds?: string[];
};

export type UpdateRoleDto = {
  name?: string;
  description?: string;
  permissionIds?: string[];
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

  async create(dto: CreateRoleDto, actorId?: string): Promise<RoleRecord> {
    if (!this.prisma.connected) throw new ConflictException('Database unavailable');

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const existing = await this.prisma.role.findFirst({
      where: { tenantId: dto.tenantId, name: dto.name.trim(), deletedAt: null },
    });
    if (existing) throw new ConflictException('Role name already exists for tenant');

    const roleId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.role.create({
        data: {
          id: roleId,
          publicId: newPublicId('role'),
          tenantId: dto.tenantId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          systemRole: false,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      if (dto.permissionIds?.length) {
        for (const permissionId of dto.permissionIds) {
          await tx.rolePermission.create({
            data: {
              id: randomUUID(),
              tenantId: dto.tenantId,
              roleId,
              permissionId,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
        }
      }
    });

    const rows = await this.listRoles(dto.tenantId);
    return rows.find((r) => r.id === roleId)!;
  }

  async update(id: string, dto: UpdateRoleDto, actorId?: string): Promise<RoleRecord> {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          updatedBy: actorId,
        },
      });

      if (dto.permissionIds !== undefined) {
        await tx.rolePermission.updateMany({
          where: { roleId: id, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: actorId },
        });
        for (const permissionId of dto.permissionIds) {
          await tx.rolePermission.create({
            data: {
              id: randomUUID(),
              tenantId: role.tenantId,
              roleId: id,
              permissionId,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
        }
      }
    });

    const rows = await this.listRoles(role.tenantId);
    return rows.find((r) => r.id === id)!;
  }

  async softDelete(id: string, actorId?: string): Promise<void> {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.systemRole) throw new ConflictException('System roles cannot be deleted');

    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId },
    });
  }
}
