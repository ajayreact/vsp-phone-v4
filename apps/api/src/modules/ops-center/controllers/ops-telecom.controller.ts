import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpsAlertSeverity, OpsAlertStatus } from '@prisma/client';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  AlertActionDto,
  AlertQueryDto,
  CallDiagnosticsQueryDto,
  NocTenantQueryDto,
  SipRegistrationActionDto,
  SipRegistrationQueryDto,
  SipTraceQueryDto,
} from '../dto/noc.dto';
import { OpsAlertsService } from '../services/ops-alerts.service';
import { OpsCallDiagnosticsService } from '../services/ops-call-diagnostics.service';
import { OpsCarrierMonitoringService } from '../services/ops-carrier-monitoring.service';
import { OpsFraudDetectionService } from '../services/ops-fraud-detection.service';
import { OpsKamailioService } from '../services/ops-kamailio-ops.service';
import { OpsMediaMonitoringService } from '../services/ops-media-monitoring.service';
import { OpsNocDashboardService } from '../services/ops-noc-dashboard.service';
import { OpsRtpengineService } from '../services/ops-rtpengine-ops.service';
import { OpsSipDialogsService } from '../services/ops-sip-dialogs.service';
import { OpsSipRegistrationsService } from '../services/ops-sip-registrations.service';
import { OpsSipTraceService } from '../services/ops-sip-trace.service';
import { OpsSyntheticMonitoringService } from '../services/ops-synthetic-monitoring.service';

@ApiTags('ops-telecom-noc')
@ApiBearerAuth()
@Controller('v1/ops')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class OpsTelecomController {
  constructor(
    private readonly nocDashboard: OpsNocDashboardService,
    private readonly sipRegistrations: OpsSipRegistrationsService,
    private readonly sipDialogs: OpsSipDialogsService,
    private readonly sipTraceSvc: OpsSipTraceService,
    private readonly media: OpsMediaMonitoringService,
    private readonly kamailio: OpsKamailioService,
    private readonly rtpengine: OpsRtpengineService,
    private readonly carriers: OpsCarrierMonitoringService,
    private readonly alerts: OpsAlertsService,
    private readonly fraud: OpsFraudDetectionService,
    private readonly synthetic: OpsSyntheticMonitoringService,
    private readonly diagnostics: OpsCallDiagnosticsService,
  ) {}

  @Get('noc/dashboard')
  @RequirePermission(PERMISSIONS.OPS_DASHBOARD_READ)
  @ApiOperation({ summary: 'Enterprise NOC platform dashboard' })
  nocDashboardSnapshot(@Query() query: NocTenantQueryDto) {
    return this.nocDashboard.getPlatformDashboard(query.tenantId).then((data) => ({ data }));
  }

  @Get('sip/registrations/enriched')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  @ApiOperation({ summary: 'SIP registrations with live contact metadata' })
  enrichedRegistrations(@Query() query: SipRegistrationQueryDto) {
    return this.sipRegistrations.list(query).then((data) => ({ data }));
  }

  @Post('sip/registrations/:id/refresh')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  refreshRegistration(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.sipRegistrations.refresh(id, user.sub);
  }

  @Post('sip/registrations/:id/unregister')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  unregister(@Param('id') id: string, @Body() dto: SipRegistrationActionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.sipRegistrations.unregister(id, user.sub, dto.reason);
  }

  @Post('sip/registrations/:id/force-reregister')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  forceReregister(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.sipRegistrations.forceReregister(id, user.sub);
  }

  @Get('sip/dialogs')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  @ApiOperation({ summary: 'Active SIP dialogs' })
  listDialogs(@Query() query: NocTenantQueryDto & { limit?: number }) {
    return this.sipDialogs.listActive(query).then((data) => ({ data }));
  }

  @Get('sip/trace')
  @RequirePermission(PERMISSIONS.OPS_TRACE_READ)
  @ApiOperation({ summary: 'SIP trace search and ladder view' })
  searchSipTrace(@Query() query: SipTraceQueryDto) {
    return this.sipTraceSvc.search(query);
  }

  @Get('media/sessions')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  mediaSessions(@Query() query: NocTenantQueryDto & { limit?: number }) {
    return this.media.listActiveSessions(query).then((data) => ({ data }));
  }

  @Get('media/rtp')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  rtpSessions(@Query() query: NocTenantQueryDto & { limit?: number }) {
    return this.media.listRtpSessions(query).then((data) => ({ data }));
  }

  @Get('kamailio/dashboard')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  kamailioDashboard() {
    return this.kamailio.getDashboard();
  }

  @Post('kamailio/reload')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  kamailioReload(@Body() body: { note?: string }, @Req() req: Request) {
    void getJwtUser(req);
    return this.kamailio.reload(body.note);
  }

  @Get('rtpengine/dashboard')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  rtpengineDashboard(@Query() query: NocTenantQueryDto) {
    return this.rtpengine.getDashboard(query.tenantId);
  }

  @Get('carriers/monitoring')
  @RequirePermission(PERMISSIONS.OPS_HEALTH_READ)
  carrierMonitoring() {
    return this.carriers.getOverview();
  }

  @Get('alerts')
  @RequirePermission(PERMISSIONS.OPS_ALERTS_READ)
  listAlerts(@Query() query: AlertQueryDto) {
    return this.alerts
      .list({
        tenantId: query.tenantId,
        status: query.status as OpsAlertStatus | undefined,
        severity: query.severity as OpsAlertSeverity | undefined,
        limit: query.limit,
      })
      .then((data) => ({ data }));
  }

  @Post('alerts/:id/acknowledge')
  @RequirePermission(PERMISSIONS.OPS_ALERTS_WRITE)
  acknowledgeAlert(@Param('id') id: string, @Body() dto: AlertActionDto, @Req() req: Request) {
    return this.alerts.acknowledge(id, getJwtUser(req).sub, dto.note);
  }

  @Post('alerts/:id/resolve')
  @RequirePermission(PERMISSIONS.OPS_ALERTS_WRITE)
  resolveAlert(@Param('id') id: string, @Body() dto: AlertActionDto, @Req() req: Request) {
    return this.alerts.resolve(id, getJwtUser(req).sub, dto.note);
  }

  @Post('alerts/:id/escalate')
  @RequirePermission(PERMISSIONS.OPS_ALERTS_WRITE)
  escalateAlert(@Param('id') id: string, @Req() req: Request) {
    return this.alerts.escalate(id, getJwtUser(req).sub);
  }

  @Post('alerts/:id/silence')
  @RequirePermission(PERMISSIONS.OPS_ALERTS_WRITE)
  silenceAlert(@Param('id') id: string, @Body() dto: AlertActionDto, @Req() req: Request) {
    return this.alerts.silence(id, getJwtUser(req).sub, dto.silenceMinutes ?? 60);
  }

  @Get('fraud/scan')
  @RequirePermission(PERMISSIONS.OPS_FRAUD_READ)
  fraudScan(@Query() query: NocTenantQueryDto) {
    return this.fraud.scan(query.tenantId);
  }

  @Post('synthetic/run')
  @RequirePermission(PERMISSIONS.OPS_HEALTH_READ)
  runSynthetic() {
    return this.synthetic.runHealthChecks();
  }

  @Get('diagnostics/calls/:platformUuid')
  @RequirePermission(PERMISSIONS.OPS_TRACE_READ)
  callDiagnostics(
    @Param('platformUuid') platformUuid: string,
    @Query() query: CallDiagnosticsQueryDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const tenantId = query.tenantId ?? user.tenantId;
    return this.diagnostics.diagnose(tenantId, platformUuid).then((data) => ({ data }));
  }
}
