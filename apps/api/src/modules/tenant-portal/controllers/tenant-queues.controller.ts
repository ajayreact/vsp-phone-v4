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
  Sse,
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
  AgentPauseDto,
  BulkImportQueuesDto,
  BulkQueueMembersDto,
  CloneQueueDto,
  CreateQueueCallbackDto,
  CreateQueueDto,
  QueueMemberDto,
  QueueStateDto,
  UpdateQueueDto,
} from '../dto/tenant-queues.dto';
import { TenantQueueEventsService } from '../services/tenant-queue-events.service';
import { TenantQueuesService } from '../services/tenant-queues.service';

@ApiTags('tenant-queues')
@ApiBearerAuth()
@Controller('v1/tenant/queues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantQueuesController {
  constructor(
    private readonly queues: TenantQueuesService,
    private readonly events: TenantQueueEventsService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'List call queues with agents' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.queues.list(user.tenantId, search);
    return { data };
  }

  @Get('dashboard')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_READ, PERMISSIONS.SUPERVISOR_QUEUES_READ)
  @ApiOperation({ summary: 'Live queue dashboard metrics' })
  async dashboard(@Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.queues.getDashboard(user.tenantId) };
  }

  @Sse('events/stream')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_READ, PERMISSIONS.SUPERVISOR_QUEUES_READ)
  @ApiOperation({ summary: 'SSE stream for queue real-time metrics' })
  eventStream(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.events.subscribe(user.tenantId);
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export queues as CSV' })
  async exportCsv(@Req() req: Request, @Res() res: Response) {
    const user = getJwtUser(req);
    const csv = await this.queues.exportCsv(user.tenantId);
    res.setHeader('Content-Disposition', 'attachment; filename="queues.csv"');
    res.send(csv);
  }

  @Get('export/json')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'Export queues as JSON' })
  async exportJson(@Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.queues.exportJson(user.tenantId) };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'Get queue detail' })
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.getById(user.tenantId, id);
  }

  @Get(':id/dashboard')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_READ, PERMISSIONS.SUPERVISOR_QUEUES_READ)
  @ApiOperation({ summary: 'Queue-specific live metrics' })
  async queueDashboard(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.queues.getDashboard(user.tenantId, id);
    return { data: data[0] ?? null };
  }

  @Get(':id/reports')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_READ, PERMISSIONS.SUPERVISOR_REPORTS_READ)
  @ApiOperation({ summary: 'Queue reporting summary' })
  reports(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.getReports(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Create call queue' })
  create(@Body() dto: CreateQueueDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Bulk import queues' })
  bulkImport(@Body() dto: BulkImportQueuesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.bulkImport(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Update call queue' })
  update(@Param('id') id: string, @Body() dto: UpdateQueueDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.update(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/clone')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Clone queue configuration' })
  clone(@Param('id') id: string, @Body() dto: CloneQueueDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.clone(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/pause')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_QUEUES_WRITE)
  @ApiOperation({ summary: 'Pause queue' })
  pause(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, user.sub, id, { paused: true });
  }

  @Post(':id/resume')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_QUEUES_WRITE)
  @ApiOperation({ summary: 'Resume queue' })
  resume(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, user.sub, id, { paused: false, emergencyClosed: false });
  }

  @Post(':id/emergency-close')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_QUEUES_WRITE)
  @ApiOperation({ summary: 'Emergency close queue' })
  emergencyClose(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, user.sub, id, { emergencyClosed: true });
  }

  @Post(':id/overflow')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Set overflow queue routing' })
  overflow(@Param('id') id: string, @Body() dto: QueueStateDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete call queue' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.remove(user.tenantId, user.sub, id);
  }

  @Get(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'List queue agents' })
  async listMembers(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.queues.listMembers(user.tenantId, id);
    return { data };
  }

  @Post(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Add queue agent' })
  addMember(@Param('id') id: string, @Body() dto: QueueMemberDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.addMember(user.tenantId, user.sub, id, dto);
  }

  @Put(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Replace all queue agents' })
  replaceMembers(@Param('id') id: string, @Body() dto: BulkQueueMembersDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.replaceMembers(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id/members/:memberId')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Update queue agent' })
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: QueueMemberDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.queues.updateMember(user.tenantId, user.sub, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Remove queue agent' })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.queues.removeMember(user.tenantId, user.sub, id, memberId);
  }

  @Post(':id/members/:memberId/login')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_AGENTS_WRITE)
  agentLogin(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.agentLogin(user.tenantId, user.sub, id, memberId);
  }

  @Post(':id/members/:memberId/logout')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_AGENTS_WRITE)
  agentLogout(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.agentLogout(user.tenantId, user.sub, id, memberId);
  }

  @Post(':id/members/:memberId/pause')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_AGENTS_WRITE)
  agentPause(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: AgentPauseDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.queues.agentPause(user.tenantId, user.sub, id, memberId, dto);
  }

  @Post(':id/members/:memberId/resume')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.SUPERVISOR_AGENTS_WRITE)
  agentResume(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.agentResume(user.tenantId, user.sub, id, memberId);
  }

  @Get(':id/callbacks')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'List queue callbacks' })
  async listCallbacks(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.queues.listCallbacks(user.tenantId, id);
    return { data };
  }

  @Post(':id/callbacks')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Schedule customer callback' })
  createCallback(@Param('id') id: string, @Body() dto: CreateQueueCallbackDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.createCallback(user.tenantId, user.sub, id, dto);
  }
}
