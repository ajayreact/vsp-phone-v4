import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';

/** Phase 16 — RBAC permission lookup from frozen Prisma schema. */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async userHasPermission(userId: string, permissionKey: string): Promise<boolean> {
    if (!this.prisma.connected) return false;
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
    if (!this.prisma.connected) return [];
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
