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
  PlatformUsersService,
  type CreatePlatformUserDto,
  type UpdatePlatformUserDto,
} from '../services/platform-users.service';

@ApiTags('platform-users')
@ApiBearerAuth()
@Controller('v1/platform/users')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformUsersController {
  constructor(private readonly users: PlatformUsersService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List users across tenants (optional tenant/role/status filters)' })
  async list(
    @Query('tenantId') tenantId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('role') role: string | undefined,
    @Query('status') status: string | undefined,
  ) {
    const data = await this.users.list({ tenantId, search, role, status });
    return { data };
  }

  @Post()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Create platform user' })
  async create(@Body() dto: CreatePlatformUserDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.users.create(dto, user.sub);
    return { data };
  }

  @Patch(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Update platform user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.users.update(id, dto, user.sub);
    return { data };
  }

  @Delete(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Soft-delete platform user' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    await this.users.softDelete(id, user.sub);
    return { data: { ok: true } };
  }
}
