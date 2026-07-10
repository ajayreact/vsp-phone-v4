import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  PlatformRolesService,
  type CreateRoleDto,
  type UpdateRoleDto,
} from '../services/platform-roles.service';

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

  @Post('roles')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_ROLES_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Create role' })
  async createRole(@Body() dto: CreateRoleDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.roles.create(dto, user.sub);
    return { data };
  }

  @Patch('roles/:id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_ROLES_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Update role' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.roles.update(id, dto, user.sub);
    return { data };
  }

  @Delete('roles/:id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_ROLES_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Soft-delete role' })
  async deleteRole(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    await this.roles.softDelete(id, user.sub);
    return { data: { ok: true } };
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
