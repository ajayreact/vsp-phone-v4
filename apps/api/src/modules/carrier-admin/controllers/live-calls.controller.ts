import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsService } from '../../enterprise-security/auth/permissions.service';
import { RequireAnyPermission, RequirePermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { LiveCallsAdminService } from '../services/live-calls-admin.service';

@ApiTags('live-calls')
@ApiBearerAuth()
@Controller('v1/live-calls')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class LiveCallsAdminController {
  constructor(
    private readonly liveCalls: LiveCallsAdminService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.TENANT_ADMIN, PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Active call sessions for NOC view' })
  async list(@Query('tenantId') tenantIdQuery: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const isSuper = await this.permissions.userHasPermission(user.sub, PERMISSIONS.PLATFORM_SUPER_ADMIN);
    const tenantId = isSuper ? tenantIdQuery ?? user.tenantId : user.tenantId;
    const data = await this.liveCalls.listActive({ tenantId, limit: 100 });
    return { data };
  }
}
