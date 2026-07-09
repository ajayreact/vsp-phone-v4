import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getJwtUser } from '../../auth/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions.service';

export const PERMISSION_KEY = 'security:permission';
export const PERMISSIONS_ANY_KEY = 'security:permissions_any';

export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);

/** Phase 16 — RBAC permission guard (Prisma RolePermission). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>(PERMISSION_KEY, context.getHandler());
    const anyPermissions = this.reflector.get<string[]>(PERMISSIONS_ANY_KEY, context.getHandler());

    if (!permission && !anyPermissions?.length) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = getJwtUser(req);

    if (anyPermissions?.length) {
      for (const p of anyPermissions) {
        if (await this.permissions.userHasPermission(user.sub, p)) return true;
      }
      throw new ForbiddenException('Insufficient permissions');
    }

    const allowed = await this.permissions.userHasPermission(user.sub, permission!);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
