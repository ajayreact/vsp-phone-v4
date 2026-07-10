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
  TenantRoutingService,
  type CreateCallPolicyDto,
  type UpdateCallPolicyDto,
} from '../services/tenant-routing.service';

@ApiTags('tenant-routing')
@ApiBearerAuth()
@Controller('v1/tenant/routing/policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRoutingController {
  constructor(private readonly routing: TenantRoutingService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'List call routing policies' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.routing.listPolicies(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Create call routing policy' })
  create(@Body() dto: CreateCallPolicyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routing.createPolicy(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Update call routing policy' })
  update(@Param('id') id: string, @Body() dto: UpdateCallPolicyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routing.updatePolicy(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete call routing policy' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routing.removePolicy(user.tenantId, user.sub, id);
  }
}
