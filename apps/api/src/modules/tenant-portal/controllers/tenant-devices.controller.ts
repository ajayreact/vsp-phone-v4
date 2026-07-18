import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Logger,
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
  AssignDeviceDto,
  BulkAssignDevicesDto,
  BulkDeviceIdsDto,
  BulkImportDevicesDto,
  CloneDeviceDto,
  CreateDeviceDto,
  MoveDeviceSiteDto,
  UpdateDeviceDto,
} from '../dto/tenant-devices.dto';
import { TenantDevicesService } from '../services/tenant-devices.service';

@ApiTags('tenant-devices')
@ApiBearerAuth()
@Controller('v1/tenant/devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantDevicesController {
  private readonly logger = new Logger(TenantDevicesController.name);

  constructor(private readonly devices: TenantDevicesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'List tenant device inventory' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.devices.list(user.tenantId, search);
    return { data };
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_READ)
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export device inventory as CSV' })
  async exportCsv(@Req() req: Request, @Res() res: Response) {
    const user = getJwtUser(req);
    const csv = await this.devices.exportCsv(user.tenantId);
    res.setHeader('Content-Disposition', 'attachment; filename="devices.csv"');
    res.send(csv);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'Get device detail with provisioning metadata' })
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Create device (auto-enrolls desk phone when MAC + line provided)' })
  async create(@Body() dto: CreateDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    this.logger.log(
      JSON.stringify({
        event: 'tenant.device.create.controller',
        tenantId: user.tenantId,
        actorUserId: user.sub,
        extensionId: (req.body as { extensionId?: string } | undefined)?.extensionId ?? null,
        devicePayload: {
          name: dto.name,
          deviceType: dto.deviceType,
          lineId: dto.lineId ?? null,
          manufacturer: dto.manufacturer ?? null,
          model: dto.model ?? null,
          macAddress: dto.macAddress ? '[present]' : null,
          transport: dto.transport ?? null,
        },
      }),
    );
    try {
      return await this.devices.create(user.tenantId, user.sub, dto);
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          event: 'tenant.device.create.controller_error',
          tenantId: user.tenantId,
          actorUserId: user.sub,
          lineId: dto.lineId ?? null,
          deviceType: dto.deviceType,
          errName: err instanceof Error ? err.name : 'Unknown',
          errMsg: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Bulk import devices from structured rows' })
  bulkImport(@Body() dto: BulkImportDevicesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.bulkImport(user.tenantId, user.sub, dto);
  }

  @Post('bulk-assign')
  @RequireAnyPermission(PERMISSIONS.TENANT_DEVICES_WRITE, PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Bulk assign devices to a line' })
  bulkAssign(@Body() dto: BulkAssignDevicesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.bulkAssign(user.tenantId, user.sub, dto);
  }

  @Post('bulk-delete')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Bulk delete devices' })
  bulkDelete(@Body() dto: BulkDeviceIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.bulkDelete(user.tenantId, user.sub, dto.deviceIds);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Update device inventory fields' })
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.update(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/assign')
  @RequireAnyPermission(PERMISSIONS.TENANT_DEVICES_WRITE, PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Assign device to line' })
  assign(@Param('id') id: string, @Body() dto: AssignDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.assign(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/unassign')
  @RequireAnyPermission(PERMISSIONS.TENANT_DEVICES_WRITE, PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Unassign device from line' })
  unassign(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.unassign(user.tenantId, user.sub, id);
  }

  @Post(':id/deactivate')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Deactivate device' })
  deactivate(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.deactivate(user.tenantId, user.sub, id);
  }

  @Post(':id/activate')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Activate device' })
  activate(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.activate(user.tenantId, user.sub, id);
  }

  @Post(':id/make-primary')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Mark device as primary for its extension (clears primary on siblings)' })
  makePrimary(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.makePrimary(user.tenantId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Clone device configuration to new device' })
  clone(@Param('id') id: string, @Body() dto: CloneDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.clone(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/move-site')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Move device to another site' })
  moveSite(@Param('id') id: string, @Body() dto: MoveDeviceSiteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.moveSite(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Soft-delete device' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.devices.remove(user.tenantId, user.sub, id);
  }
}
