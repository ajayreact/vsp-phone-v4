import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../auth/password.util';
import {
  UsersAdminService,
  type UserAdminRecord,
} from '../../carrier-admin/services/users-admin.service';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type CreateTenantUserDto = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleName?: string;
};

export type UpdateTenantUserDto = {
  email?: string;
  firstName?: string;
  lastName?: string;
  roleName?: string;
};

export type SetTenantUserStatusDto = {
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'LOCKED';
};

@Injectable()
export class TenantUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersAdmin: UsersAdminService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  list(tenantId: string, search?: string): Promise<UserAdminRecord[]> {
    return this.usersAdmin.list({ tenantId, search });
  }

  async create(
    tenantId: string,
    actorId: string,
    dto: CreateTenantUserDto,
  ): Promise<UserAdminRecord> {
    if (!this.prisma.connected) throw new ConflictException('Database unavailable');

    const email = dto.email.trim().toLowerCase();
    if (!email || !dto.password || dto.password.length < 8) {
      throw new BadRequestException('Valid email and password (min 8 chars) are required');
    }

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
    if (existing) throw new ConflictException('User email already exists');

    const userId = randomUUID();
    const roleName = dto.roleName?.trim() || 'User';

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          publicId: newPublicId('u'),
          tenantId,
          email,
          passwordHash: hashPassword(dto.password),
          status: UserStatus.ACTIVE,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      await tx.userProfile.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          displayName: `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim(),
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      const role = await tx.role.findFirst({
        where: { tenantId, name: roleName, deletedAt: null },
      });
      if (role) {
        await tx.userRole.create({
          data: {
            id: randomUUID(),
            tenantId,
            userId,
            roleId: role.id,
            createdBy: actorId,
            updatedBy: actorId,
          },
        });
      }
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: actorId,
      action: 'pbx.user.create',
      entityType: 'User',
      entityId: userId,
      metadata: { email, roleName },
    });

    return this.requireRecord(tenantId, userId);
  }

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    dto: UpdateTenantUserDto,
  ): Promise<UserAdminRecord> {
    await this.requireUser(tenantId, id);

    await this.prisma.$transaction(async (tx) => {
      if (dto.email !== undefined) {
        const email = dto.email.trim().toLowerCase();
        const clash = await tx.user.findFirst({
          where: { tenantId, email, deletedAt: null, id: { not: id } },
        });
        if (clash) throw new ConflictException('User email already exists');
        await tx.user.update({
          where: { id },
          data: { email, updatedBy: actorId },
        });
      }

      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        const profile = await tx.userProfile.findFirst({
          where: { userId: id, tenantId, deletedAt: null },
        });
        if (profile) {
          const firstName = dto.firstName?.trim() ?? profile.firstName;
          const lastName = dto.lastName?.trim() ?? profile.lastName;
          await tx.userProfile.update({
            where: { id: profile.id },
            data: {
              firstName,
              lastName,
              displayName: `${firstName} ${lastName}`.trim(),
              updatedBy: actorId,
            },
          });
        }
      }

      if (dto.roleName?.trim()) {
        const role = await tx.role.findFirst({
          where: { tenantId, name: dto.roleName.trim(), deletedAt: null },
        });
        if (role) {
          await tx.userRole.updateMany({
            where: { userId: id, tenantId, deletedAt: null },
            data: { deletedAt: new Date(), deletedBy: actorId },
          });
          await tx.userRole.create({
            data: {
              id: randomUUID(),
              tenantId,
              userId: id,
              roleId: role.id,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
        }
      }
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: actorId,
      action: 'pbx.user.update',
      entityType: 'User',
      entityId: id,
    });

    return this.requireRecord(tenantId, id);
  }

  async setStatus(
    tenantId: string,
    actorId: string,
    id: string,
    dto: SetTenantUserStatusDto,
  ): Promise<UserAdminRecord> {
    await this.requireUser(tenantId, id);
    if (!['ACTIVE', 'INACTIVE', 'PENDING', 'LOCKED'].includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: dto.status as UserStatus, updatedBy: actorId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: actorId,
      action: dto.status === 'ACTIVE' ? 'pbx.user.enable' : 'pbx.user.disable',
      entityType: 'User',
      entityId: id,
      metadata: { status: dto.status },
    });

    return this.requireRecord(tenantId, id);
  }

  async resetPassword(
    tenantId: string,
    actorId: string,
    id: string,
    password?: string,
  ): Promise<{ ok: true; temporaryPassword?: string }> {
    await this.requireUser(tenantId, id);
    const temporaryPassword =
      password?.trim() && password.trim().length >= 8
        ? password.trim()
        : randomBytes(9).toString('base64url').slice(0, 12);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: hashPassword(temporaryPassword),
        updatedBy: actorId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: actorId,
      action: 'pbx.user.reset_password',
      entityType: 'User',
      entityId: id,
    });

    return {
      ok: true,
      ...(password?.trim() ? {} : { temporaryPassword }),
    };
  }

  async softDelete(tenantId: string, actorId: string, id: string): Promise<void> {
    await this.requireUser(tenantId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.line.updateMany({
        where: { tenantId, userId: id, deletedAt: null },
        data: { userId: null, updatedBy: actorId },
      });
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: actorId,
          status: UserStatus.INACTIVE,
          updatedBy: actorId,
        },
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: actorId,
      action: 'pbx.user.delete',
      entityType: 'User',
      entityId: id,
    });
  }

  async assignExtension(
    tenantId: string,
    actorId: string,
    userId: string,
    extensionId: string,
  ): Promise<UserAdminRecord> {
    await this.requireUser(tenantId, userId);
    const extension = await this.prisma.extension.findFirst({
      where: { id: extensionId, ...tenantScope(tenantId) },
      select: { id: true, lineId: true, extension: true },
    });
    if (!extension) throw new NotFoundException('Extension not found');

    await this.prisma.line.update({
      where: { id: extension.lineId },
      data: { userId, updatedBy: actorId, version: { increment: 1 } },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: actorId,
      action: 'pbx.extension.user_assign',
      entityType: 'Extension',
      entityId: extension.id,
      metadata: { userId, extension: extension.extension },
    });

    return this.requireRecord(tenantId, userId);
  }

  async unassignExtension(
    tenantId: string,
    actorId: string,
    userId: string,
    extensionId?: string,
  ): Promise<UserAdminRecord> {
    await this.requireUser(tenantId, userId);

    if (extensionId) {
      const extension = await this.prisma.extension.findFirst({
        where: { id: extensionId, ...tenantScope(tenantId) },
        select: { id: true, lineId: true },
      });
      if (!extension) throw new NotFoundException('Extension not found');
      await this.prisma.line.updateMany({
        where: { id: extension.lineId, tenantId, userId, deletedAt: null },
        data: { userId: null, updatedBy: actorId },
      });
      await auditPbxMutation(this.audit, {
        tenantId,
        actorUserId: actorId,
        action: 'pbx.extension.user_remove',
        entityType: 'Extension',
        entityId: extension.id,
        metadata: { userId },
      });
    } else {
      const lines = await this.prisma.line.findMany({
        where: { tenantId, userId, deletedAt: null },
        select: { id: true, extension: { select: { id: true } } },
      });
      await this.prisma.line.updateMany({
        where: { tenantId, userId, deletedAt: null },
        data: { userId: null, updatedBy: actorId },
      });
      for (const line of lines) {
        if (line.extension?.id) {
          await auditPbxMutation(this.audit, {
            tenantId,
            actorUserId: actorId,
            action: 'pbx.extension.user_remove',
            entityType: 'Extension',
            entityId: line.extension.id,
            metadata: { userId },
          });
        }
      }
    }

    return this.requireRecord(tenantId, userId);
  }

  private async requireUser(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async requireRecord(tenantId: string, id: string): Promise<UserAdminRecord> {
    const rows = await this.usersAdmin.list({ tenantId });
    const row = rows.find((u) => u.id === id);
    if (!row) throw new NotFoundException('User not found');
    return row;
  }
}
