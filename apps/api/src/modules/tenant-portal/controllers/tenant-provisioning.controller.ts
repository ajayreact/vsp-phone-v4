import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  ApproveFirmwareDto,
  BulkProvisionDevicesDto,
  BulkFirmwareUpdateDto,
  CreateProvisioningTemplateDto,
  EnrollDeviceDto,
  ReprovisionDeviceDto,
  RollbackDeviceConfigDto,
  ScheduleFirmwareRolloutDto,
  UpdateProvisioningTemplateDto,
} from '../dto/tenant-provisioning.dto';
import { BulkDeviceIdsDto } from '../dto/tenant-devices.dto';
import { TenantDeviceProvisioningService } from '../services/tenant-device-provisioning.service';
import { TenantProvisioningTemplatesService } from '../services/tenant-provisioning-templates.service';

@ApiTags('tenant-provisioning')
@ApiBearerAuth()
@Controller('v1/tenant/provisioning')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantProvisioningController {
  constructor(
    private readonly provisioning: TenantDeviceProvisioningService,
    private readonly templates: TenantProvisioningTemplatesService,
  ) {}

  @Post('devices/enroll')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Zero-touch enroll desk phone' })
  enroll(@Body() dto: EnrollDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.enroll(user.tenantId, user.sub, dto);
  }

  @Post('devices/reprovision')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Reprovision device configuration' })
  reprovision(@Body() dto: ReprovisionDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.reprovision(user.tenantId, user.sub, dto.deviceId);
  }

  @Post('devices/rollback')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Rollback device configuration version' })
  rollback(@Body() dto: RollbackDeviceConfigDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.rollback(user.tenantId, user.sub, dto);
  }

  @Get('devices/:deviceId/config/preview')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'Preview provisioning configuration' })
  previewConfig(@Param('deviceId') deviceId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.previewConfig(user.tenantId, deviceId);
  }

  @Get('devices/:deviceId/config/download')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'Download provisioning configuration' })
  downloadConfig(@Param('deviceId') deviceId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.downloadConfig(user.tenantId, deviceId);
  }

  @Get('devices/:deviceId/config/history')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'Configuration version history' })
  configHistory(@Param('deviceId') deviceId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.configHistory(user.tenantId, deviceId);
  }

  @Post('devices/bulk-provision')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Bulk reprovision devices' })
  bulkProvision(@Body() dto: BulkProvisionDevicesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.bulkProvision(user.tenantId, user.sub, dto.deviceIds);
  }

  @Post('devices/bulk-reboot')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Bulk queue device reboot commands' })
  bulkReboot(@Body() dto: BulkDeviceIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.bulkCommand(user.tenantId, user.sub, dto.deviceIds, 'reboot');
  }

  @Post('devices/bulk-factory-reset')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Bulk queue factory reset and reprovision' })
  bulkFactoryReset(@Body() dto: BulkDeviceIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.bulkCommand(user.tenantId, user.sub, dto.deviceIds, 'factory_reset');
  }

  @Post('devices/:deviceId/reboot')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Queue device reboot command' })
  reboot(@Param('deviceId') deviceId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.queueCommand(user.tenantId, user.sub, deviceId, 'reboot');
  }

  @Post('devices/:deviceId/factory-reset')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Queue factory reset and reprovision' })
  factoryReset(@Param('deviceId') deviceId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.queueCommand(user.tenantId, user.sub, deviceId, 'factory_reset');
  }

  @Get('firmware')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'Firmware catalog and approved releases' })
  listFirmware(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.listFirmware(user.tenantId);
  }

  @Post('firmware/approve')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Approve firmware release' })
  approveFirmware(@Body() dto: ApproveFirmwareDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.approveFirmware(user.tenantId, user.sub, dto);
  }

  @Post('firmware/schedule-rollout')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Schedule firmware rollout' })
  scheduleRollout(@Body() dto: ScheduleFirmwareRolloutDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.scheduleRollout(user.tenantId, user.sub, dto);
  }

  @Post('firmware/bulk-update')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Bulk firmware update on devices' })
  bulkFirmwareUpdate(@Body() dto: BulkFirmwareUpdateDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provisioning.bulkFirmwareUpdate(user.tenantId, user.sub, dto.deviceIds, dto.releaseId);
  }

  @Get('templates')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'List provisioning templates' })
  listTemplates(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.templates.list(user.tenantId);
  }

  @Get('templates/:id')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'Get provisioning template' })
  getTemplate(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.templates.getById(user.tenantId, id);
  }

  @Post('templates')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Create provisioning template' })
  createTemplate(@Body() dto: CreateProvisioningTemplateDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.templates.create(user.tenantId, user.sub, dto);
  }

  @Patch('templates/:id')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Update provisioning template' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateProvisioningTemplateDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.templates.update(user.tenantId, user.sub, id, dto);
  }

  @Delete('templates/:id')
  @RequireAnyPermission(PERMISSIONS.PROVISIONING_ADMIN, PERMISSIONS.TENANT_DEVICES_WRITE)
  @ApiOperation({ summary: 'Delete provisioning template' })
  removeTemplate(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.templates.remove(user.tenantId, user.sub, id);
  }
}
