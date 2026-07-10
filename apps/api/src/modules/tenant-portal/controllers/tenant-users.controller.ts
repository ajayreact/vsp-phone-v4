import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { UsersAdminService } from '../../carrier-admin/services/users-admin.service';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';

@ApiTags('tenant-users')
@ApiBearerAuth()
@Controller('v1/tenant/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantUsersController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_USERS_READ)
  @ApiOperation({ summary: 'List tenant users' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.users.list({ tenantId: user.tenantId, search });
    return { data };
  }
}
