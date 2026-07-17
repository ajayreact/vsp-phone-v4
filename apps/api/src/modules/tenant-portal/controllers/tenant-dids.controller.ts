import {
  Body,
  Controller,
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
    summary: 'Assign / change / remove a DID → extension binding (Extension Workspace)',
    description:
      'Platform Admin assigns raw numbers to a tenant (auto-provisioning the extension). Once a number belongs to the ' +
      'tenant, tenant admins may (re)bind it to one of their own extensions from Configure → DID. Scoped to tenant-owned ' +
      'numbers only; enforces One DID ↔ One Extension via assertCanBindDidToLine.',
  })
  async assign(@Param('id') id: string, @Body() dto: AssignDidDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.dids.assign(user.tenantId, user.sub, id, dto);
    return { data };
  }
}
