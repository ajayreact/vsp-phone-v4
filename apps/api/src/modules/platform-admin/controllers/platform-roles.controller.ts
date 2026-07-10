import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformRolesService } from '../services/platform-roles.service';

@ApiTags('platform-roles')
@ApiBearerAuth()
@Controller('v1/platform')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformRolesController {
  constructor(private readonly roles: PlatformRolesService) {}

  @Get('roles')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_ROLES_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List roles across tenants' })
  async listRoles(@Query('tenantId') tenantId?: string) {
    const data = await this.roles.listRoles(tenantId);
    return { data };
  }

  @Get('permissions')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_ROLES_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List permissions across tenants' })
  async listPermissions(@Query('tenantId') tenantId?: string) {
    const data = await this.roles.listPermissions(tenantId);
    return { data };
  }
}
