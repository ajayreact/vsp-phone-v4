import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RouteDestinationType } from '@prisma/client';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { AssignDidDto } from '../dto/tenant-dids.dto';
import { TenantDidsService } from '../services/tenant-dids.service';

@ApiTags('tenant-dids')
@ApiBearerAuth()
@Controller('v1/tenant/dids')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantDidsController {
  constructor(private readonly dids: TenantDidsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'List tenant phone numbers (DIDs) with routing summary' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.dids.list(user.tenantId, search);
    return { data };
  }

  @Get('destinations')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({
    summary: 'List routable destinations by type',
    description:
      'For EXTENSION/LINE, omits targets that already have an active DID (One DID ↔ One Extension) unless ALLOW_MULTIPLE_DIDS_PER_EXTENSION=true. Pass phoneNumberId when reassigning so the current owner stays selectable.',
  })
  async destinations(
    @Query('type') type: RouteDestinationType,
    @Query('phoneNumberId') phoneNumberId: string | undefined,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.dids.listDestinations(user.tenantId, type, {
      forPhoneNumberId: phoneNumberId,
    });
    return { data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'Get DID detail with routing and history' })
  async getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.dids.getById(user.tenantId, id);
    return { data };
  }

  @Post(':id/assign')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_WRITE)
  @ApiOperation({
    summary: 'Assign DID routing destination (disabled for tenants)',
    description:
      'Extension Workspace: Platform Admin assigns DIDs to tenants (auto-provisions extension). Tenant portal cannot assign; use Remove DID / Configure on the extension instead.',
  })
  async assign(@Param('id') _id: string, @Body() _dto: AssignDidDto, @Req() req: Request) {
    // Tenant surface only accepts tenant JWTs — this write path is retired.
    // Platform Admin assigns DIDs via carrier inventory (auto-provisions extensions).
    getJwtUser(req);
    throw new ForbiddenException(
      'DID assignment is managed by Platform Admin. Numbers appear on extensions automatically when assigned to your tenant.',
    );
  }
}
