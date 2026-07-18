import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { KamailioPersistenceService } from '../../enterprise-ha/backup/kamailio-persistence.service';
import { RtpengineNodeRegistryService } from '../../enterprise-ha/failover/rtpengine-node-registry.service';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { OperationsDashboardService } from '../../enterprise-observability/dashboard/operations-dashboard.service';
import { CallInspectorService } from '../../enterprise-observability/diagnostics/call-inspector.service';
import {
  AuditQueryDto,
  CallDiagnosticsQueryDto,
} from '../../enterprise-observability/dto/observability.request.dto';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { DeploymentReadinessService } from '../../production-platform/deployment/deployment-readiness.service';
import { OpsSipRegistrationsService } from '../services/ops-sip-registrations.service';

@ApiTags('ops-center')
@ApiBearerAuth()
@Controller('v1/ops')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class OpsCenterController {
  constructor(
    private readonly dashboard: OperationsDashboardService,
    private readonly health: EnterpriseHealthService,
    private readonly deployment: DeploymentReadinessService,
    private readonly kamailioPersistenceSvc: KamailioPersistenceService,
    private readonly rtpengine: RtpengineNodeRegistryService,
    private readonly audit: EnterpriseAuditService,
    private readonly sipRegistrationsSvc: OpsSipRegistrationsService,
    private readonly callInspector: CallInspectorService,
  ) {}

  @Get('dashboard')
  @RequireAnyPermission(PERMISSIONS.OPS_DASHBOARD_READ, PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Operations dashboard snapshot' })
  dashboardSnapshot(@Query('tenantId') tenantId?: string) {
    return this.dashboard.snapshot(tenantId);
  }

  @Get('health')
  @RequireAnyPermission(PERMISSIONS.OPS_HEALTH_READ, PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Infrastructure health and deployment readiness' })
  async healthDetail() {
    const [components, readiness] = await Promise.all([
      this.health.checkAll(),
      this.deployment.buildReport(),
    ]);
    return { components, readiness };
  }

  @Get('kamailio/persistence')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  @ApiOperation({ summary: 'Kamailio usrloc persistence report' })
  getKamailioPersistence() {
    return this.kamailioPersistenceSvc.evaluate();
  }

  @Get('rtpengine/nodes')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  @ApiOperation({ summary: 'RTPengine cluster node registry' })
  rtpengineNodes() {
    return { nodes: this.rtpengine.listNodes() };
  }

  @Get('redis/stats')
  @RequirePermission(PERMISSIONS.OPS_HEALTH_READ)
  @ApiOperation({ summary: 'Redis health stats' })
  async redisStats() {
    return this.health.checkRedis();
  }

  @Get('postgres/stats')
  @RequirePermission(PERMISSIONS.OPS_HEALTH_READ)
  @ApiOperation({ summary: 'PostgreSQL health stats' })
  async postgresStats() {
    return this.health.checkPostgres();
  }

  @Get('carriers/health')
  @RequirePermission(PERMISSIONS.OPS_HEALTH_READ)
  @ApiOperation({ summary: 'Carrier health status' })
  async carriersHealth() {
    return this.health.checkTelnyx();
  }

  @Get('audit')
  @RequireAnyPermission(
    PERMISSIONS.OPS_TRACE_READ,
    PERMISSIONS.PLATFORM_AUDIT_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Immutable audit log query' })
  auditQuery(@Query() query: AuditQueryDto) {
    return this.audit.query(query);
  }

  @Get('sip/registrations')
  @RequirePermission(PERMISSIONS.OPS_INFRA_READ)
  @ApiOperation({ summary: 'List SIP endpoint registrations' })
  async listSipRegistrations(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.sipRegistrationsSvc.list({
      tenantId,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }

  @Get('trace/calls')
  @RequirePermission(PERMISSIONS.OPS_TRACE_READ)
  @ApiOperation({ summary: 'Call trace inspector' })
  async traceCalls(@Query() query: CallDiagnosticsQueryDto) {
    if (query.platformUuid) {
      return this.callInspector.inspectByPlatformUuid(query.tenantId, query.platformUuid);
    }
    return this.callInspector.search(query);
  }
}
