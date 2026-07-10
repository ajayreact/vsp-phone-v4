import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsService } from '../../enterprise-security/auth/permissions.service';
import { RequireAnyPermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { UsersAdminService } from '../services/users-admin.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('v1/users')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class UsersAdminController {
  constructor(
    private readonly users: UsersAdminService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.TENANT_ADMIN, PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'List tenant users for admin portal' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const isSuper = await this.permissions.userHasPermission(user.sub, PERMISSIONS.PLATFORM_SUPER_ADMIN);
    const tenantId = isSuper ? undefined : user.tenantId;
    const data = await this.users.list({ tenantId, search });
    return { data };
  }
}
