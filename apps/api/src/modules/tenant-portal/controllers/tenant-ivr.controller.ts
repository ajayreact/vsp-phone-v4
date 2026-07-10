import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
  BulkImportIvrsDto,
  CloneIvrDto,
  CreateIvrDto,
  PublishIvrDto,
  SaveIvrDraftDto,
  SimulateIvrDto,
  UpdateIvrDto,
} from '../dto/tenant-ivr.dto';
import { TenantIvrService } from '../services/tenant-ivr.service';

@ApiTags('tenant-ivr')
@ApiBearerAuth()
@Controller('v1/tenant/ivrs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantIvrController {
  constructor(private readonly ivr: TenantIvrService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'List IVR flows' })
  async list(@Req() req: Request, @Query('search') search?: string) {
    const user = getJwtUser(req);
    const data = await this.ivr.list(user.tenantId, search);
    return { data };
  }

  @Get('export/json')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'Export IVR flows as JSON' })
  async exportJson(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.ivr.exportJson(user.tenantId);
    return { data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'Get IVR flow detail' })
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.getById(user.tenantId, id);
  }

  @Get(':id/versions')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'List IVR flow version history' })
  async versions(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.ivr.getVersions(user.tenantId, id);
    return { data };
  }

  @Get(':id/reports')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'IVR usage reports' })
  reports(@Param('id') id: string, @Req() req: Request, @Query('days') days?: string) {
    const user = getJwtUser(req);
    return this.ivr.getReports(user.tenantId, id, days ? Number(days) : 7);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Create IVR flow' })
  create(@Body() dto: CreateIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Bulk import IVR flows' })
  bulkImport(@Body() dto: BulkImportIvrsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.bulkImport(user.tenantId, user.sub, dto);
  }

  @Post(':id/clone')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Clone IVR flow' })
  clone(@Param('id') id: string, @Body() dto: CloneIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.clone(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/draft')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Save IVR draft flow' })
  saveDraft(@Param('id') id: string, @Body() dto: SaveIvrDraftDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.saveDraft(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/publish')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Publish IVR flow' })
  publish(@Param('id') id: string, @Body() dto: PublishIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.publish(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/simulate')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'Simulate IVR call flow' })
  simulate(@Param('id') id: string, @Body() dto: SimulateIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.simulate(user.tenantId, id, dto);
  }

  @Post(':id/validate')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  @ApiOperation({ summary: 'Validate IVR draft flow' })
  validate(@Param('id') id: string, @Body() dto: SaveIvrDraftDto, @Req() req: Request) {
    getJwtUser(req);
    return this.ivr.validateFlow(dto.flow);
  }

  @Post(':id/versions/:version/restore')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Restore IVR flow version to draft' })
  restoreVersion(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.ivr.restoreVersion(user.tenantId, user.sub, id, version);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  @ApiOperation({ summary: 'Update IVR configuration' })
  update(@Param('id') id: string, @Body() dto: UpdateIvrDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete IVR flow' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ivr.remove(user.tenantId, user.sub, id);
  }
}
