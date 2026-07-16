import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { AuthPortal } from '../../auth/jwt.util';

const DEV_FALLBACK_PERMISSIONS = [
  'platform:super_admin',
  'tenant:admin',
  'provisioning:admin',
  'recordings:read',
  'presence:read',
  'presence:write',
];

export type PermissionCheckContext = {
  portal?: AuthPortal;
  impersonatorUserId?: string;
};

/** Phase 16 — RBAC permission lookup from frozen Prisma schema. */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async userHasPermission(
    userId: string,
    permissionKey: string,
    ctx: PermissionCheckContext = {},
  ): Promise<boolean> {
    if (!this.prisma.connected) {
      const devUserId = (this.config.get<string>('DEV_AUTH_USER_ID') || '').trim();
      if (devUserId && userId === devUserId) {
        return (
          DEV_FALLBACK_PERMISSIONS.includes(permissionKey) ||
          permissionKey.startsWith('platform:') ||
          permissionKey.startsWith('ops:') ||
          permissionKey.startsWith('tenant:')
        );
      }
      return false;
    }

    const isSuperAdmin = await this.isSuperAdmin(userId);

    // Impersonation session: grant tenant-plane permissions for the target tenant context.
    if (ctx.impersonatorUserId && ctx.portal === 'tenant') {
      if (
        permissionKey.startsWith('tenant:') ||
        permissionKey === 'provisioning:admin' ||
        permissionKey.startsWith('recordings:') ||
        permissionKey.startsWith('presence:')
      ) {
        return true;
      }
    }

    // Super admin bypass is limited to platform/ops planes — never auto-grant tenant:*.
    if (isSuperAdmin) {
      if (
        permissionKey === 'platform:super_admin' ||
        permissionKey.startsWith('platform:') ||
        permissionKey.startsWith('ops:')
      ) {
        return true;
      }
    }

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

  async isSuperAdmin(userId: string): Promise<boolean> {
    if (!this.prisma.connected) {
      const devUserId = (this.config.get<string>('DEV_AUTH_USER_ID') || '').trim();
      return Boolean(devUserId && userId === devUserId);
    }
    const count = await this.prisma.rolePermission.count({
      where: {
        deletedAt: null,
        permission: { key: 'platform:super_admin', deletedAt: null },
        role: { deletedAt: null, userRoles: { some: { userId, deletedAt: null } } },
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

  hasTenantPlanePermission(permissionKeys: string[]): boolean {
    return permissionKeys.some((p) => p.startsWith('tenant:') || p === 'tenant:admin');
  }

  hasPlatformPlanePermission(permissionKeys: string[]): boolean {
    return (
      permissionKeys.includes('platform:super_admin') ||
      permissionKeys.some((p) => p.startsWith('platform:'))
    );
  }

  hasOpsPlanePermission(permissionKeys: string[]): boolean {
    return (
      permissionKeys.includes('platform:super_admin') ||
      permissionKeys.some((p) => p.startsWith('ops:'))
    );
  }
}
