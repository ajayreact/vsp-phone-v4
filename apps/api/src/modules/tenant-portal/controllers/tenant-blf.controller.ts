import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import { CreateBlfPanelDto, ReorderBlfKeysDto, UpdateBlfPanelDto } from '../dto/tenant-blf.dto';
import { TenantBlfService } from '../services/tenant-blf.service';

@ApiTags('tenant-blf')
@ApiBearerAuth()
@Controller('v1/tenant/blf')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantBlfController {
  constructor(private readonly blf: TenantBlfService) {}

  @Get('panels')
  @RequirePermission(PERMISSIONS.TENANT_BLF_READ)
  async listPanels(@Req() req: Request, @Query('mine') mine?: string) {
    const user = getJwtUser(req);
    const data = await this.blf.listPanels(user.tenantId, mine === 'true' ? user.sub : undefined);
    return { data };
  }

  @Get('panels/:id')
  @RequirePermission(PERMISSIONS.TENANT_BLF_READ)
  getPanel(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.getPanel(user.tenantId, id);
  }

  @Get('panels/:id/lamps')
  @RequirePermission(PERMISSIONS.TENANT_BLF_READ)
  lamps(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.getLampsForPanel(user.tenantId, id);
  }

  @Get('lines/:lineId/lamp')
  @RequirePermission(PERMISSIONS.TENANT_BLF_READ)
  lampForLine(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.getLampDetail(user.tenantId, lineId);
  }

  @Post('panels')
  @RequirePermission(PERMISSIONS.TENANT_BLF_WRITE)
  createPanel(@Body() dto: CreateBlfPanelDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.createPanel(user.tenantId, user.sub, dto);
  }

  @Patch('panels/:id')
  @RequirePermission(PERMISSIONS.TENANT_BLF_WRITE)
  updatePanel(@Param('id') id: string, @Body() dto: UpdateBlfPanelDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.updatePanel(user.tenantId, user.sub, id, dto);
  }

  @Post('panels/:id/reorder')
  @RequirePermission(PERMISSIONS.TENANT_BLF_WRITE)
  reorder(@Param('id') id: string, @Body() dto: ReorderBlfKeysDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.reorderKeys(user.tenantId, user.sub, id, dto);
  }

  @Delete('panels/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_BLF_WRITE, PERMISSIONS.TENANT_ADMIN)
  removePanel(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.blf.removePanel(user.tenantId, user.sub, id);
  }
}
