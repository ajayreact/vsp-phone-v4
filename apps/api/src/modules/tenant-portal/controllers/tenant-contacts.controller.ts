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
  BulkContactIdsDto,
  CreateContactDto,
  ImportContactsCsvDto,
  RecordRecentContactDto,
  SearchContactsDto,
  UpdateContactDto,
} from '../dto/tenant-contacts.dto';
import { TenantContactsService } from '../services/tenant-contacts.service';

@ApiTags('tenant-contacts')
@ApiBearerAuth()
@Controller('v1/tenant/contacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantContactsController {
  constructor(private readonly contacts: TenantContactsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  async list(@Query() query: SearchContactsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.contacts.list(user.tenantId, user.sub, query);
    return { data };
  }

  @Get('directory')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  directory(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.getDirectory(user.tenantId, search);
  }

  @Get('favorites')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  favorites(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.listFavorites(user.tenantId, user.sub);
  }

  @Get('speed-dial')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  speedDial(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.listSpeedDial(user.tenantId, user.sub);
  }

  @Get('recent')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  recent(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.listRecent(user.tenantId, user.sub);
  }

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  reports(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.getReports(user.tenantId);
  }

  @Get('integrations')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  integrations(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.getDirectoryIntegrations(user.tenantId);
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  @Header('Content-Type', 'text/csv')
  async exportCsv(@Req() req: Request, @Res() res: Response) {
    const user = getJwtUser(req);
    const csv = await this.contacts.exportCsv(user.tenantId, user.sub);
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_WRITE)
  create(@Body() dto: CreateContactDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.create(user.tenantId, user.sub, dto);
  }

  @Post('import')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_WRITE)
  importCsv(@Body() dto: ImportContactsCsvDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.importCsv(user.tenantId, user.sub, dto);
  }

  @Post('recent')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_WRITE)
  recordRecent(@Body() dto: RecordRecentContactDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.recordRecent(user.tenantId, user.sub, dto);
  }

  @Post('bulk-delete')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_WRITE)
  bulkDelete(@Body() dto: BulkContactIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.bulkDelete(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_CONTACTS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateContactDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_CONTACTS_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.contacts.remove(user.tenantId, user.sub, id);
  }
}
