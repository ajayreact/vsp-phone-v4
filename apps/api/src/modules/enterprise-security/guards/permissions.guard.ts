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

export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

/** Phase 16 — RBAC permission guard (Prisma RolePermission). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>(PERMISSION_KEY, context.getHandler());
    if (!permission) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = getJwtUser(req);
    const allowed = await this.permissions.userHasPermission(user.sub, permission);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
