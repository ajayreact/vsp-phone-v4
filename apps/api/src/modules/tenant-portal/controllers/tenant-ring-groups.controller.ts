import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  BulkImportRingGroupsDto,
  BulkRingGroupMembersDto,
  CloneRingGroupDto,
  CreateRingGroupDto,
  RingGroupMemberDto,
  UpdateRingGroupDto,
} from '../dto/tenant-ring-groups.dto';
import { TenantRingGroupsService } from '../services/tenant-ring-groups.service';

@ApiTags('tenant-ring-groups')
@ApiBearerAuth()
@Controller('v1/tenant/ring-groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRingGroupsController {
  constructor(private readonly ringGroups: TenantRingGroupsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'List ring groups with members' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.ringGroups.list(user.tenantId, search);
    return { data };
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export ring groups as CSV' })
  async exportCsv(@Req() req: Request, @Res() res: Response) {
    const user = getJwtUser(req);
    const csv = await this.ringGroups.exportCsv(user.tenantId);
    res.setHeader('Content-Disposition', 'attachment; filename="ring-groups.csv"');
    res.send(csv);
  }

  @Get('export/json')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'Export ring groups as JSON' })
  async exportJson(@Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.ringGroups.exportJson(user.tenantId) };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'Get ring group detail' })
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Create ring group' })
  create(@Body() dto: CreateRingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Bulk import ring groups' })
  bulkImport(@Body() dto: BulkImportRingGroupsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.bulkImport(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Update ring group' })
  update(@Param('id') id: string, @Body() dto: UpdateRingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.update(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/clone')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Clone ring group' })
  clone(@Param('id') id: string, @Body() dto: CloneRingGroupDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.clone(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete ring group' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.remove(user.tenantId, user.sub, id);
  }

  @Post(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Add ring group member' })
  addMember(@Param('id') id: string, @Body() dto: RingGroupMemberDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.addMember(user.tenantId, user.sub, id, dto);
  }

  @Put(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Replace all ring group members' })
  replaceMembers(@Param('id') id: string, @Body() dto: BulkRingGroupMembersDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.ringGroups.replaceMembers(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id/members/:memberId')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  @ApiOperation({ summary: 'Update ring group member' })
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: RingGroupMemberDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.ringGroups.updateMember(user.tenantId, user.sub, id, memberId, dto);
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
    return this.ringGroups.removeMember(user.tenantId, user.sub, id, memberId);
  }
}
