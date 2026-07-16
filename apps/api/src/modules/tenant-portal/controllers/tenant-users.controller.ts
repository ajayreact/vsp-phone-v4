import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  TenantUsersService,
  type CreateTenantUserDto,
  type SetTenantUserStatusDto,
  type UpdateTenantUserDto,
} from '../services/tenant-users.service';

@ApiTags('tenant-users')
@ApiBearerAuth()
@Controller('v1/tenant/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantUsersController {
  constructor(private readonly users: TenantUsersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_USERS_READ)
  @ApiOperation({ summary: 'List tenant users' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.users.list(user.tenantId, search);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Create tenant user' })
  async create(@Body() dto: CreateTenantUserDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.users.create(user.tenantId, user.sub, dto);
    return { data };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Update tenant user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantUserDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.users.update(user.tenantId, user.sub, id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Soft-delete tenant user' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    await this.users.softDelete(user.tenantId, user.sub, id);
    return { ok: true };
  }

  @Patch(':id/status')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Enable or disable tenant user' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: SetTenantUserStatusDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.users.setStatus(user.tenantId, user.sub, id, dto);
    return { data };
  }

  @Patch(':id/reset-password')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Reset tenant user password' })
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password?: string },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.users.resetPassword(user.tenantId, user.sub, id, body?.password);
  }

  @Patch(':id/assign-extension')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Assign user to an extension' })
  async assignExtension(
    @Param('id') id: string,
    @Body() body: { extensionId: string },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.users.assignExtension(
      user.tenantId,
      user.sub,
      id,
      body.extensionId,
    );
    return { data };
  }

  @Patch(':id/unassign-extension')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Remove user from extension(s)' })
  async unassignExtension(
    @Param('id') id: string,
    @Body() body: { extensionId?: string },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.users.unassignExtension(
      user.tenantId,
      user.sub,
      id,
      body?.extensionId,
    );
    return { data };
  }
}
