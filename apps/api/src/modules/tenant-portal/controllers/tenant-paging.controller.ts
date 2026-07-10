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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PagingGroupKind } from '@prisma/client';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  BulkPagingMembersDto,
  CreatePagingGroupDto,
  UpdatePagingGroupDto,
} from '../dto/tenant-paging.dto';
import { TenantPagingService } from '../services/tenant-paging.service';

@ApiTags('tenant-paging')
@ApiBearerAuth()
@Controller('v1/tenant/paging')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantPagingController {
  constructor(private readonly paging: TenantPagingService) {}

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_PAGING_READ)
  reports(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.paging.getReports(user.tenantId);
  }

  @Get('groups')
  @RequirePermission(PERMISSIONS.TENANT_PAGING_READ)
  async list(@Req() req: Request, @Query('kind') kind?: PagingGroupKind) {
    const user = getJwtUser(req);
    const data = await this.paging.list(user.tenantId, kind);
    return { data };
  }

  @Get('groups/:id')
  @RequirePermission(PERMISSIONS.TENANT_PAGING_READ)
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.paging.getById(user.tenantId, id);
  }

  @Post('groups')
  @RequirePermission(PERMISSIONS.TENANT_PAGING_WRITE)
  create(@Body() dto: CreatePagingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.paging.create(user.tenantId, user.sub, dto);
  }

  @Patch('groups/:id')
  @RequirePermission(PERMISSIONS.TENANT_PAGING_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdatePagingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.paging.update(user.tenantId, user.sub, id, dto);
  }

  @Post('groups/:id/members')
  @RequirePermission(PERMISSIONS.TENANT_PAGING_WRITE)
  setMembers(@Param('id') id: string, @Body() dto: BulkPagingMembersDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.paging.setMembers(user.tenantId, user.sub, id, dto);
  }

  @Delete('groups/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_PAGING_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.paging.remove(user.tenantId, user.sub, id);
  }
}
