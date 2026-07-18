import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
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
  BulkImportExtensionsDto,
  CreateExtensionDto,
  RenameExtensionDisplayNameDto,
  UpdateExtensionDto,
} from '../dto/tenant-extensions.dto';
import { TenantExtensionsService } from '../services/tenant-extensions.service';

@ApiTags('tenant-extensions')
@ApiBearerAuth()
@Controller('v1/tenant/extensions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantExtensionsController {
  constructor(private readonly extensions: TenantExtensionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'List tenant extensions with line telephony settings' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.extensions.list(user.tenantId, search);
    return { data };
  }

  @Get('hub/stats')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'Extension hub KPI statistics' })
  async hubStats(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.hubStats(user.tenantId);
  }

  @Get('hub')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'Extension hub rows with DID, device, status, and display names' })
  async listHub(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.extensions.listHub(user.tenantId, search);
    return { data };
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export extensions as CSV' })
  async exportCsv(@Req() req: Request, @Res() res: Response) {
    const user = getJwtUser(req);
    const csv = await this.extensions.exportCsvAsync(user.tenantId);
    res.setHeader('Content-Disposition', 'attachment; filename="extensions.csv"');
    res.send(csv);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'Get extension detail' })
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Create extension (user optional — auto-provisions standalone line)' })
  create(@Body() dto: CreateExtensionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Bulk import extensions from structured rows' })
  bulkImport(@Body() dto: BulkImportExtensionsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.bulkImport(user.tenantId, user.sub, dto);
  }

  @Post(':id/restart-registration')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Restart SIP registration (regenerate mobile QR or reset desk phone)' })
  restartRegistration(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.restartRegistration(user.tenantId, user.sub, id);
  }

  @Post(':id/unassign-did')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Remove assigned DID from extension' })
  unassignDid(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.unassignDid(user.tenantId, user.sub, id);
  }

  @Post(':id/disable')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Disable extension (deactivate line; stops routing/registration)' })
  disable(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.disable(user.tenantId, user.sub, id);
  }

  @Post(':id/enable')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Re-enable a previously disabled extension' })
  enable(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.enable(user.tenantId, user.sub, id);
  }

  @Post(':id/archive')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Archive extension (hide from active workflows; restorable)' })
  archive(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.archive(user.tenantId, user.sub, id);
  }

  @Post(':id/unarchive')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Restore an archived extension' })
  unarchive(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.unarchive(user.tenantId, user.sub, id);
  }

  @Get(':id/activity')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'Activity timeline for this extension (audit trail + last call), newest first' })
  async activity(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.extensions.activity(user.tenantId, id);
    return { data };
  }

  @Post(':id/mobile-qr')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Generate mobile app QR with WebRTC enroll token and deep link' })
  mobileQr(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.mobileQr(user.tenantId, user.sub, id);
  }

  @Patch(':id/display-name')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Rename extension display name (Line.name)' })
  renameDisplayName(
    @Param('id') id: string,
    @Body() dto: RenameExtensionDisplayNameDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.extensions.renameDisplayName(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Update extension and line telephony settings' })
  update(@Param('id') id: string, @Body() dto: UpdateExtensionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete extension' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.remove(user.tenantId, user.sub, id);
  }
}
