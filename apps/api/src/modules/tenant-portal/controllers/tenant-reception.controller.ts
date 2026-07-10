import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import {
  CreateParkingLotDto,
  ParkCallDto,
  PickupCallDto,
  ReceptionCallActionDto,
  ReceptionHoldDto,
  ReceptionMuteDto,
  ReceptionTransferDto,
  RetrieveParkedCallDto,
  SetOperatorPresenceDto,
  UpdateParkingLotDto,
} from '../dto/tenant-reception.dto';
import { TenantReceptionEventsService } from '../services/tenant-reception-events.service';
import { TenantReceptionService } from '../services/tenant-reception.service';

@ApiTags('tenant-reception')
@ApiBearerAuth()
@Controller('v1/tenant/reception')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantReceptionController {
  constructor(
    private readonly reception: TenantReceptionService,
    private readonly events: TenantReceptionEventsService,
  ) {}

  @Get('dashboard')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  dashboard(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.getDashboard(user.tenantId);
  }

  @Get('calls')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  async calls(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.reception.listLiveCalls(user.tenantId);
    return { data };
  }

  @Get('parking')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  async parking(@Query('lotId') lotId: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.reception.listParkedCalls(user.tenantId, lotId);
    return { data };
  }

  @Get('parking-lots')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  async parkingLots(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.reception.listParkingLots(user.tenantId);
    return { data };
  }

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  reports(@Req() req: Request, @Query('days') days?: string) {
    const user = getJwtUser(req);
    return this.reception.getReports(user.tenantId, days ? Number(days) : 30);
  }

  @Sse('events/stream')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_READ)
  @ApiOperation({ summary: 'SSE stream for reception console real-time events' })
  eventStream(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.events.subscribe(user.tenantId);
  }

  @Post('parking-lots')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  createLot(@Body() dto: CreateParkingLotDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.createParkingLot(user.tenantId, user.sub, dto);
  }

  @Patch('parking-lots/:id')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  updateLot(@Param('id') id: string, @Body() dto: UpdateParkingLotDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.updateParkingLot(user.tenantId, user.sub, id, dto);
  }

  @Post('park')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  park(@Body() dto: ParkCallDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.parkCall(user.tenantId, user.sub, dto);
  }

  @Post('retrieve')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  retrieve(@Body() dto: RetrieveParkedCallDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.retrieveParked(user.tenantId, user.sub, dto);
  }

  @Post('pickup/directed')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  directedPickup(@Body() dto: PickupCallDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.directedPickup(user.tenantId, user.sub, dto);
  }

  @Post('pickup/group')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  groupPickup(@Body() dto: PickupCallDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.groupPickup(user.tenantId, user.sub, dto);
  }

  @Post('pickup/queue')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  queuePickup(@Body() dto: PickupCallDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.queuePickup(user.tenantId, user.sub, dto);
  }

  @Post('calls/hold')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  hold(@Body() dto: ReceptionHoldDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.holdCall(user.tenantId, user.sub, dto);
  }

  @Post('calls/mute')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  mute(@Body() dto: ReceptionMuteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.muteCall(user.tenantId, user.sub, dto);
  }

  @Post('calls/transfer')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  transfer(@Body() dto: ReceptionTransferDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.transferCall(user.tenantId, user.sub, dto);
  }

  @Post('calls/hangup')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  hangup(@Body() dto: ReceptionCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.hangupCall(user.tenantId, user.sub, dto);
  }

  @Post('presence')
  @RequirePermission(PERMISSIONS.TENANT_RECEPTION_WRITE)
  setPresence(@Body() dto: SetOperatorPresenceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.reception.setOperatorPresence(user.tenantId, user.sub, dto);
  }
}
