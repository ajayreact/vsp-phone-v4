import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  TenantIvrService,
  type CreateIvrDto,
  type UpdateIvrDto,
} from '../services/tenant-ivr.service';

@ApiTags('tenant-ivr')
@ApiBearerAuth()
@Controller('v1/tenant/ivrs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantIvrController {
  constructor(private readonly ivr: TenantIvrService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'List IVR menus' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.ivr.list(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Create IVR menu' })
  create(@Body() dto: CreateIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Update IVR menu' })
  update(@Param('id') id: string, @Body() dto: UpdateIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete IVR menu' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.remove(user.tenantId, user.sub, id);
  }
}
