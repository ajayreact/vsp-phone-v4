import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../telecom/prisma/prisma.service';

const DEV_FALLBACK_PERMISSIONS = [
  'platform:super_admin',
  'tenant:admin',
  'provisioning:admin',
  'recordings:read',
  'presence:read',
  'presence:write',
];

/** Phase 16 — RBAC permission lookup from frozen Prisma schema. */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async userHasPermission(userId: string, permissionKey: string): Promise<boolean> {
    if (!this.prisma.connected) {
      const devUserId = (this.config.get<string>('DEV_AUTH_USER_ID') || '').trim();
      if (devUserId && userId === devUserId) {
        return DEV_FALLBACK_PERMISSIONS.includes(permissionKey) || permissionKey.startsWith('platform:') || permissionKey.startsWith('ops:') || permissionKey.startsWith('tenant:');
      }
      return false;
    }
    const isSuperAdmin = await this.prisma.rolePermission.count({
      where: {
        deletedAt: null,
        permission: { key: 'platform:super_admin', deletedAt: null },
        role: { deletedAt: null, userRoles: { some: { userId, deletedAt: null } } },
      },
    });
    if (isSuperAdmin > 0) return true;
    const count = await this.prisma.rolePermission.count({
      where: {
        deletedAt: null,
        permission: { key: permissionKey, deletedAt: null },
        role: {
          deletedAt: null,
          userRoles: { some: { userId, deletedAt: null } },
        },
      },
    });
    return count > 0;
  }

  async userPermissions(userId: string): Promise<string[]> {
    if (!this.prisma.connected) {
      const devUserId = (this.config.get<string>('DEV_AUTH_USER_ID') || '').trim();
      if (devUserId && userId === devUserId) return [...DEV_FALLBACK_PERMISSIONS];
      return [];
    }
    const rows = await this.prisma.rolePermission.findMany({
      where: {
        deletedAt: null,
        role: {
          deletedAt: null,
          userRoles: { some: { userId, deletedAt: null } },
        },
      },
      include: { permission: true },
      take: 200,
    });
    return rows.map((r) => r.permission.key).filter(Boolean);
  }
}
