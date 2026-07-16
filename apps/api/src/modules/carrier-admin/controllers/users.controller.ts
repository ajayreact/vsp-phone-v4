import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { RequireAnyPermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { UsersAdminService } from '../services/users-admin.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('v1/users')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class UsersAdminController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.TENANT_ADMIN, PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'List tenant users for admin portal (always scoped to JWT tenant)' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    // Never clear tenantId for super-admin — cross-tenant lists belong on /v1/platform/*.
    const data = await this.users.list({ tenantId: user.tenantId, search });
    return { data };
  }
}
