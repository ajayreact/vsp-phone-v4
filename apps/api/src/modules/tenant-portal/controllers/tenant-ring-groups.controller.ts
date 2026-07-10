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
  TenantRingGroupsService,
  type CreateRingGroupDto,
  type CreateRingGroupMemberDto,
  type UpdateRingGroupDto,
} from '../services/tenant-ring-groups.service';

@ApiTags('tenant-ring-groups')
@ApiBearerAuth()
@Controller('v1/tenant/ring-groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRingGroupsController {
  constructor(private readonly ringGroups: TenantRingGroupsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'List ring groups' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.ringGroups.list(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Create ring group' })
  create(@Body() dto: CreateRingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Update ring group' })
  update(@Param('id') id: string, @Body() dto: UpdateRingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete ring group' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.remove(user.tenantId, id);
  }

  @Post(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Add ring group member' })
  addMember(@Param('id') id: string, @Body() dto: CreateRingGroupMemberDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.addMember(user.tenantId, id, dto);
  }

  @Delete(':id/members/:memberId')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Remove ring group member' })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.ringGroups.removeMember(user.tenantId, id, memberId);
  }
}
