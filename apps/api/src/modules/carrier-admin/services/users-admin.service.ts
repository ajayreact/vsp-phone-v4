import { Injectable } from '@nestjs/common';
import { DeviceStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type UserAdminRecord = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  extension: string | null;
  extensionId: string | null;
  primaryDid: string | null;
  primaryDevice: string | null;
  registrationStatus: string | null;
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

function mapRegistration(status: DeviceStatus | undefined | null): string | null {
  if (!status) return null;
  switch (status) {
    case DeviceStatus.REGISTERED:
    case DeviceStatus.ONLINE:
    case DeviceStatus.BUSY:
      return 'registered';
    case DeviceStatus.OFFLINE:
      return 'offline';
    case DeviceStatus.UNREGISTERED:
      return 'unregistered';
    case DeviceStatus.PROVISIONING:
      return 'provisioning';
    default:
      return String(status).toLowerCase();
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

    const where: Record<string, unknown> = {
      deletedAt: null,
      tenant: { deletedAt: null, slug: { notIn: ['platform-inventory', 'inventory'] } },
    };
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
          include: {
            extension: { select: { id: true, extension: true } },
            phoneNumbers: {
              where: { deletedAt: null },
              select: { number: true },
              take: 1,
              orderBy: { createdAt: 'asc' },
            },
            devices: {
              where: { deletedAt: null },
              select: { name: true, status: true, isPrimary: true },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              take: 5,
            },
          },
          take: 1,
        },
      },
      orderBy: { email: 'asc' },
      take: 500,
    });

    return rows.map((u) => {
      const displayName = u.profile?.displayName ?? u.username ?? u.email.split('@')[0] ?? u.email;
      const line = u.lines[0];
      const primaryDevice = line?.devices?.find((d) => d.isPrimary) ?? line?.devices?.[0] ?? null;
      return {
        id: u.id,
        name: displayName,
        displayName,
        email: u.email,
        role: u.userRoles[0]?.role.name ?? 'User',
        extension: line?.extension?.extension ?? null,
        extensionId: line?.extension?.id ?? null,
        primaryDid: line?.phoneNumbers?.[0]?.number ?? null,
        primaryDevice: primaryDevice?.name ?? null,
        registrationStatus: mapRegistration(primaryDevice?.status ?? null),
        status: mapUserStatus(u.status),
        tenantId: u.tenant.id,
        tenantName: u.tenant.name,
      };
    });
  }
}
