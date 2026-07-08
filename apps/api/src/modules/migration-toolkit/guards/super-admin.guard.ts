import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthHardeningService } from '../../enterprise-security/auth/auth-hardening.service';
import { PermissionsService } from '../../enterprise-security/auth/permissions.service';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { MIGRATION_SUPER_ADMIN_PERMISSION } from '../types/migration.types';

/** Phase 19 — Super Admin guard for migration toolkit endpoints. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly jwtGuard: JwtAuthGuard;

  constructor(
    config: ConfigService,
    hardening: AuthHardeningService,
    private readonly permissions: PermissionsService,
    private readonly appConfig: ConfigService,
  ) {
    this.jwtGuard = new JwtAuthGuard(config, hardening);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtGuard.canActivate(context);

    const req = context.switchToHttp().getRequest<Request>();
    const user = getJwtUser(req);
    const permission =
      this.appConfig.get<string>('MIGRATION_SUPER_ADMIN_PERMISSION') ??
      MIGRATION_SUPER_ADMIN_PERMISSION;

    if (await this.permissions.userHasPermission(user.sub, permission)) {
      return true;
    }

    const devBypass =
      String(this.appConfig.get('MIGRATION_DEV_SUPER_ADMIN') ?? 'true').toLowerCase() === 'true';
    const devUserId = (this.appConfig.get<string>('DEV_AUTH_USER_ID') ?? '').trim();
    const vspEnv = this.appConfig.get<string>('VSP_ENV') ?? 'development';
    if (devBypass && vspEnv !== 'production' && devUserId && user.sub === devUserId) {
      return true;
    }

    throw new ForbiddenException('Super Admin authorization required');
  }
}
