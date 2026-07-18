import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type UserAdminRecord = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  extension: string | null;
  status: string;
  tenantId: string;
  tenantName: string;
};

function mapUserStatus(status: UserStatus): string {
  switch (status) {
    case UserStatus.ACTIVE:
      return 'active';
    case UserStatus.INACTIVE:
      return 'inactive';
    case UserStatus.PENDING:
      return 'pending';
    case UserStatus.LOCKED:
      return 'inactive';
    default:
      return 'pending';
  }
}

@Injectable()
export class UsersAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    tenantId?: string;
    search?: string;
    role?: string;
    status?: string;
  }): Promise<UserAdminRecord[]> {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = { deletedAt: null };
    if (params.tenantId?.trim()) {
      where.tenantId = params.tenantId.trim();
    }
    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { profile: { displayName: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (params.status?.trim()) {
      const s = params.status.trim().toUpperCase();
      if (s === 'ACTIVE' || s === 'INACTIVE' || s === 'PENDING' || s === 'LOCKED') {
        where.status = s as UserStatus;
      }
    }
    if (params.role?.trim()) {
      where.userRoles = {
        some: {
          deletedAt: null,
          role: { name: { equals: params.role.trim(), mode: 'insensitive' } },
        },
      };
    }

    const rows = await this.prisma.user.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        profile: { select: { displayName: true } },
        userRoles: {
          where: { deletedAt: null },
          include: { role: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        lines: {
          where: { deletedAt: null },
          include: { extension: { select: { extension: true } } },
          take: 1,
        },
      },
      orderBy: { email: 'asc' },
      take: 500,
    });

    return rows.map((u) => {
      const displayName = u.profile?.displayName ?? u.username ?? u.email.split('@')[0] ?? u.email;
      return {
        id: u.id,
        name: displayName,
        displayName,
        email: u.email,
        role: u.userRoles[0]?.role.name ?? 'User',
        extension: u.lines[0]?.extension?.extension ?? null,
        status: mapUserStatus(u.status),
        tenantId: u.tenant.id,
        tenantName: u.tenant.name,
      };
    });
  }
}
