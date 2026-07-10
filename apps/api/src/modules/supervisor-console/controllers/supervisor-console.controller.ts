import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
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
import { PermissionsService } from '../../enterprise-security/auth/permissions.service';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  CoachingNoteDto,
  RecordingAnnotationDto,
  RecordingSearchQueryDto,
  SupervisorAgentActionDto,
  SupervisorCallActionDto,
  SupervisorQueueActionDto,
  SupervisorTenantQueryDto,
  SupervisorTransferDto,
} from '../dto/supervisor.dto';
import { SupervisorActionsService } from '../services/supervisor-actions.service';
import { SupervisorAgentsService } from '../services/supervisor-agents.service';
import { SupervisorCallsService } from '../services/supervisor-calls.service';
import { SupervisorDashboardService } from '../services/supervisor-dashboard.service';
import { SupervisorEventsService } from '../services/supervisor-events.service';
import { SupervisorQueuesService } from '../services/supervisor-queues.service';
import { SupervisorRecordingsService } from '../services/supervisor-recordings.service';
import { SupervisorReportsService } from '../services/supervisor-reports.service';

const READ = [
  PERMISSIONS.SUPERVISOR_DASHBOARD_READ,
  PERMISSIONS.SUPERVISOR_AGENTS_READ,
  PERMISSIONS.SUPERVISOR_QUEUES_READ,
  PERMISSIONS.SUPERVISOR_CALLS_READ,
  PERMISSIONS.SUPERVISOR_WALLBOARD_READ,
  PERMISSIONS.OPS_LIVE_CALLS_READ,
  PERMISSIONS.TENANT_ADMIN,
  PERMISSIONS.PLATFORM_SUPER_ADMIN,
];

const SUPERVISE = [
  PERMISSIONS.SUPERVISOR_CALLS_SUPERVISE,
  PERMISSIONS.SUPERVISOR_AGENTS_WRITE,
  PERMISSIONS.SUPERVISOR_QUEUES_WRITE,
  PERMISSIONS.OPS_LIVE_CALLS_SUPERVISE,
  PERMISSIONS.PLATFORM_SUPER_ADMIN,
];

@ApiTags('supervisor-console')
@ApiBearerAuth()
@Controller('v1/supervisor')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class SupervisorConsoleController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly dashboard: SupervisorDashboardService,
    private readonly agents: SupervisorAgentsService,
    private readonly queues: SupervisorQueuesService,
    private readonly calls: SupervisorCallsService,
    private readonly actions: SupervisorActionsService,
    private readonly recordings: SupervisorRecordingsService,
    private readonly reportsService: SupervisorReportsService,
    private readonly events: SupervisorEventsService,
  ) {}

  private async resolveTenantId(req: Request, queryTenantId?: string): Promise<string> {
    const user = getJwtUser(req);
    const isSuper = await this.permissions.userHasPermission(user.sub, PERMISSIONS.PLATFORM_SUPER_ADMIN);
    return isSuper && queryTenantId ? queryTenantId : user.tenantId;
  }

  @Get('dashboard')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Supervisor real-time KPI dashboard' })
  async getDashboard(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return { data: await this.dashboard.getDashboard(tenantId) };
  }

  @Get('wallboard')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_WALLBOARD_READ, PERMISSIONS.SUPERVISOR_DASHBOARD_READ, ...READ)
  @ApiOperation({ summary: 'Live wallboard with queue tiles' })
  async getWallboard(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return { data: await this.dashboard.getWallboard(tenantId) };
  }

  @Get('agents')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_AGENTS_READ, ...READ)
  @ApiOperation({ summary: 'Live agent monitoring grid' })
  async listAgents(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return { data: await this.agents.listAgents(tenantId) };
  }

  @Get('queues/live')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_QUEUES_READ, ...READ)
  @ApiOperation({ summary: 'Live queue statistics' })
  async listQueues(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return { data: await this.queues.listLiveQueues(tenantId) };
  }

  @Get('calls/live')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_CALLS_READ, ...READ)
  @ApiOperation({ summary: 'Live calls with queue and quality metadata' })
  async listCalls(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return { data: await this.calls.listLiveCalls(tenantId) };
  }

  @Get('calls/:platformUuid/timeline')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_CALLS_READ, ...READ)
  @ApiOperation({ summary: 'Call event timeline' })
  async callTimeline(@Param('platformUuid') platformUuid: string, @Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return { data: await this.calls.getCallTimeline(tenantId, platformUuid) };
  }

  @Sse('events/stream')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'SSE stream for supervisor real-time events' })
  async eventStream(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    const tenantId = await this.resolveTenantId(req, query.tenantId);
    return this.events.subscribe(tenantId);
  }

  @Post('calls/listen')
  @RequireAnyPermission(...SUPERVISE)
  listen(@Body() dto: SupervisorCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.listen(user.tenantId, user.sub, dto.platformUuid, dto.supervisorLineId);
  }

  @Post('calls/whisper')
  @RequireAnyPermission(...SUPERVISE)
  whisper(@Body() dto: SupervisorCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.whisper(user.tenantId, user.sub, dto.platformUuid, dto.supervisorLineId);
  }

  @Post('calls/barge')
  @RequireAnyPermission(...SUPERVISE)
  barge(@Body() dto: SupervisorCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.barge(user.tenantId, user.sub, dto.platformUuid, dto.supervisorLineId);
  }

  @Post('calls/takeover')
  @RequireAnyPermission(...SUPERVISE)
  takeOver(@Body() dto: SupervisorCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.takeOver(user.tenantId, user.sub, dto.platformUuid, dto.supervisorLineId);
  }

  @Post('calls/hangup')
  @RequireAnyPermission(...SUPERVISE)
  hangUp(@Body() dto: SupervisorCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.hangUp(user.tenantId, user.sub, dto.platformUuid);
  }

  @Post('calls/transfer')
  @RequireAnyPermission(...SUPERVISE)
  transfer(@Body() dto: SupervisorTransferDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.transfer(user.tenantId, user.sub, dto.platformUuid, dto.target);
  }

  @Post('calls/supervision/end')
  @RequireAnyPermission(...SUPERVISE)
  endSupervision(@Body() dto: SupervisorCallActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.endSupervision(user.tenantId, user.sub, dto.platformUuid);
  }

  @Post('agents/pause')
  @RequireAnyPermission(...SUPERVISE)
  pauseAgent(@Body() dto: SupervisorAgentActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.pauseAgent(user.tenantId, user.sub, dto.lineId, dto.reason);
  }

  @Post('agents/resume')
  @RequireAnyPermission(...SUPERVISE)
  resumeAgent(@Body() dto: SupervisorAgentActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.resumeAgent(user.tenantId, user.sub, dto.lineId);
  }

  @Post('agents/force-logout')
  @RequireAnyPermission(...SUPERVISE)
  forceLogout(@Body() dto: SupervisorAgentActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.forceLogout(user.tenantId, user.sub, dto.lineId);
  }

  @Post('agents/move')
  @RequireAnyPermission(...SUPERVISE)
  moveAgent(@Body() dto: SupervisorAgentActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    if (!dto.queueId) throw new BadRequestException('queueId required');
    return this.actions.moveAgent(user.tenantId, user.sub, dto.lineId, dto.queueId);
  }

  @Post('queues/pause')
  @RequireAnyPermission(...SUPERVISE)
  pauseQueue(@Body() dto: SupervisorQueueActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, dto.queueId, { paused: true });
  }

  @Post('queues/resume')
  @RequireAnyPermission(...SUPERVISE)
  resumeQueue(@Body() dto: SupervisorQueueActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, dto.queueId, { paused: false });
  }

  @Post('queues/overflow')
  @RequireAnyPermission(...SUPERVISE)
  overflowQueue(@Body() dto: SupervisorQueueActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, dto.queueId, { overflowQueueId: dto.overflowQueueId ?? null });
  }

  @Post('queues/emergency-close')
  @RequireAnyPermission(...SUPERVISE)
  emergencyClose(@Body() dto: SupervisorQueueActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.setQueueState(user.tenantId, dto.queueId, { emergencyClosed: true, paused: true });
  }

  @Post('emergency-stop')
  @RequireAnyPermission(...SUPERVISE)
  emergencyStop(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.actions.emergencyStop(user.tenantId, user.sub);
  }

  @Get('recordings')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_RECORDINGS_READ, PERMISSIONS.RECORDINGS_READ, ...READ)
  searchRecordings(@Query() query: RecordingSearchQueryDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.search(user.tenantId, query).then((data) => ({ data }));
  }

  @Get('recordings/:id/url')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_RECORDINGS_READ, PERMISSIONS.RECORDINGS_READ, ...READ)
  recordingUrl(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.getPlaybackUrl(user.tenantId, id);
  }

  @Post('recordings/:id/annotate')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_RECORDINGS_WRITE, ...SUPERVISE)
  annotate(@Param('id') id: string, @Body() dto: RecordingAnnotationDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.addAnnotation(user.tenantId, user.sub, id, dto.type, dto.body);
  }

  @Get('coaching')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_RECORDINGS_READ, ...READ)
  listCoaching(@Query('callSessionId') callSessionId: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.listCoachingNotes(user.tenantId, callSessionId).then((data) => ({ data }));
  }

  @Post('coaching')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_RECORDINGS_WRITE, ...SUPERVISE)
  addCoaching(@Body() dto: CoachingNoteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.addCoachingNote(user.tenantId, user.sub, dto);
  }

  @Get('reports')
  @RequireAnyPermission(PERMISSIONS.SUPERVISOR_REPORTS_READ, PERMISSIONS.TENANT_REPORTS_READ, ...READ)
  getReports(@Query() query: SupervisorTenantQueryDto, @Req() req: Request) {
    return this.resolveTenantId(req, query.tenantId).then((tenantId) =>
      this.reportsService.getReports(tenantId).then((data) => ({ data })),
    );
  }
}
