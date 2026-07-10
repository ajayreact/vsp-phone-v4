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
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE)
  @ApiOperation({ summary: 'Create extension (auto-provisions line when userId provided)' })
  create(@Body() dto: CreateExtensionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE)
  @ApiOperation({ summary: 'Bulk import extensions from structured rows' })
  bulkImport(@Body() dto: BulkImportExtensionsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.bulkImport(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE)
  @ApiOperation({ summary: 'Update extension and line telephony settings' })
  update(@Param('id') id: string, @Body() dto: UpdateExtensionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete extension' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.remove(user.tenantId, user.sub, id);
  }
}
