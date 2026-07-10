import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { SearchPresenceDto, SetLinePresenceDto } from '../dto/tenant-presence.dto';
import { TenantPresenceService } from '../services/tenant-presence.service';

@ApiTags('tenant-presence')
@ApiBearerAuth()
@Controller('v1/tenant/presence')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantPresenceController {
  constructor(private readonly presence: TenantPresenceService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  @ApiOperation({ summary: 'List line presence for directory and BLF' })
  async list(@Query() query: SearchPresenceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.presence.list(user.tenantId, query);
    return { data };
  }

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  reports(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.presence.getReports(user.tenantId);
  }

  @Get('lines/:lineId')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  getByLine(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.presence.getByLineId(user.tenantId, lineId);
  }

  @Patch('lines/:lineId')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  setManual(@Param('lineId') lineId: string, @Body() dto: SetLinePresenceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.presence.setManual(user.tenantId, user.sub, lineId, dto);
  }
}
