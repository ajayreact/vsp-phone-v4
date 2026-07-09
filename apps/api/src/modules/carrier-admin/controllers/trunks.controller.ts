import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { RequirePermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { TrunksAdminService } from '../services/trunks-admin.service';

@ApiTags('carriers-trunks')
@ApiBearerAuth()
@Controller('v1/carriers/trunks')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class TrunksAdminController {
  constructor(private readonly trunks: TrunksAdminService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'List SIP trunks with live health metrics' })
  list() {
    return this.trunks.list().then((data) => ({ data }));
  }
}
