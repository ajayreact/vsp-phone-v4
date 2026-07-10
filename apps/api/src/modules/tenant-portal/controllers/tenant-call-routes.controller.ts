import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  BulkImportInboundRoutesDto,
  BulkImportOutboundRoutesDto,
  CreateInboundRouteDto,
  CreateOutboundRouteDto,
  TestRouteDto,
  UpdateInboundRouteDto,
  UpdateOutboundRouteDto,
} from '../dto/tenant-call-routes.dto';
import { TenantCallRoutesService } from '../services/tenant-call-routes.service';
import { TenantRoutingEventsService } from '../services/tenant-routing-events.service';

@ApiTags('tenant-call-routes')
@ApiBearerAuth()
@Controller('v1/tenant/routing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantCallRoutesController {
  constructor(
    private readonly routes: TenantCallRoutesService,
    private readonly events: TenantRoutingEventsService,
  ) {}

  @Get('metrics')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'Live routing metrics' })
  async metrics(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.getLiveMetrics(user.tenantId);
  }

  @Sse('events/stream')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'SSE stream for routing events' })
  stream(@Req() req: Request): Observable<MessageEvent> {
    const user = getJwtUser(req);
    return this.events.subscribe(user.tenantId);
  }

  @Post('test')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'Test inbound route resolution' })
  testRoute(@Body() dto: TestRouteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.testRoute(user.tenantId, dto);
  }

  // Inbound routes
  @Get('inbound')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  @ApiOperation({ summary: 'List inbound routes' })
  async listInbound(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.routes.listInbound(user.tenantId);
    return { data };
  }

  @Get('inbound/export/json')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  exportInbound(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.exportInboundJson(user.tenantId);
  }

  @Get('inbound/:id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  getInbound(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.getInboundById(user.tenantId, id);
  }

  @Post('inbound')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  createInbound(@Body() dto: CreateInboundRouteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.createInbound(user.tenantId, user.sub, dto);
  }

  @Post('inbound/bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  bulkImportInbound(@Body() dto: BulkImportInboundRoutesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.bulkImportInbound(user.tenantId, user.sub, dto);
  }

  @Post('inbound/:id/clone')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  cloneInbound(@Param('id') id: string, @Body('name') name: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.cloneInbound(user.tenantId, user.sub, id, name);
  }

  @Patch('inbound/:id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  updateInbound(@Param('id') id: string, @Body() dto: UpdateInboundRouteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.updateInbound(user.tenantId, user.sub, id, dto);
  }

  @Delete('inbound/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeInbound(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.removeInbound(user.tenantId, user.sub, id);
  }

  // Outbound routes
  @Get('outbound')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  async listOutbound(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.routes.listOutbound(user.tenantId);
    return { data };
  }

  @Get('outbound/export/json')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  exportOutbound(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.exportOutboundJson(user.tenantId);
  }

  @Get('outbound/:id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  getOutbound(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.getOutboundById(user.tenantId, id);
  }

  @Post('outbound')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  createOutbound(@Body() dto: CreateOutboundRouteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.createOutbound(user.tenantId, user.sub, dto);
  }

  @Post('outbound/bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  bulkImportOutbound(@Body() dto: BulkImportOutboundRoutesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.bulkImportOutbound(user.tenantId, user.sub, dto);
  }

  @Patch('outbound/:id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  updateOutbound(@Param('id') id: string, @Body() dto: UpdateOutboundRouteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.updateOutbound(user.tenantId, user.sub, id, dto);
  }

  @Delete('outbound/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeOutbound(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.routes.removeOutbound(user.tenantId, user.sub, id);
  }
}
