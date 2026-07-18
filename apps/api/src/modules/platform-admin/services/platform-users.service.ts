import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../auth/password.util';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';
import { UsersAdminService, type UserAdminRecord } from '../../carrier-admin/services/users-admin.service';

export type CreatePlatformUserDto = {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleName?: string;
};

export type UpdatePlatformUserDto = {
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: UserStatus;
  roleName?: string;
};

@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersAdmin: UsersAdminService,
  ) {}

  list(params: {
    tenantId?: string;
    search?: string;
    role?: string;
    status?: string;
  }): Promise<UserAdminRecord[]> {
    return this.usersAdmin.list(params);
  }

  async create(dto: CreatePlatformUserDto, actorId?: string): Promise<UserAdminRecord> {
    if (!this.prisma.connected) throw new ConflictException('Database unavailable');

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: dto.tenantId, email, deletedAt: null },
    });
    if (existing) throw new ConflictException('User email already exists for tenant');

    const userId = randomUUID();
    const roleName = dto.roleName?.trim() || 'Tenant Admin';

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          publicId: newPublicId('u'),
          tenantId: dto.tenantId,
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
          tenantId: dto.tenantId,
          userId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          displayName: `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim(),
          createdBy: actorId,
          updatedBy: actorId,
        },
      });

      const role = await tx.role.findFirst({
        where: { tenantId: dto.tenantId, name: roleName, deletedAt: null },
      });
      if (role) {
        await tx.userRole.create({
          data: {
            id: randomUUID(),
            tenantId: dto.tenantId,
            userId,
            roleId: role.id,
            createdBy: actorId,
            updatedBy: actorId,
          },
        });
      }
    });

    const rows = await this.usersAdmin.list({ tenantId: dto.tenantId, search: email });
    const created = rows.find((u) => u.id === userId);
    if (!created) throw new ConflictException('User created but could not be loaded');
    return created;
  }

  async update(id: string, dto: UpdatePlatformUserDto, actorId?: string): Promise<UserAdminRecord> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedBy: actorId,
        },
      });

      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        const profile = await tx.userProfile.findFirst({ where: { userId: id, deletedAt: null } });
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

      if (dto.roleName) {
        const role = await tx.role.findFirst({
          where: { tenantId: user.tenantId, name: dto.roleName, deletedAt: null },
        });
        if (role) {
          await tx.userRole.updateMany({
            where: { userId: id, deletedAt: null },
            data: { deletedAt: new Date(), deletedBy: actorId },
          });
          await tx.userRole.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              userId: id,
              roleId: role.id,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
        }
      }
    });

    const rows = await this.usersAdmin.list({ tenantId: user.tenantId });
    return rows.find((u) => u.id === id) ?? rows[0];
  }

  async softDelete(id: string, actorId?: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, status: UserStatus.INACTIVE },
    });
  }
}
