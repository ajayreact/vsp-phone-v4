import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TelecomServiceAuthGuard } from '../../../common/telecom/telecom-service-auth.guard';
import { AuditQueryDto, CallDiagnosticsQueryDto } from '../dto/observability.request.dto';
import { EnterpriseAuditService } from '../audit/enterprise-audit.service';
import { CallInspectorService } from '../diagnostics/call-inspector.service';
import { OperationsDashboardService } from '../dashboard/operations-dashboard.service';
import { EnterpriseHealthService } from '../health/enterprise-health.service';

@ApiTags('observability')
@ApiSecurity('telecom-service-auth')
@Controller('v1/observability')
@UseGuards(TelecomServiceAuthGuard)
export class ObservabilityController {
  constructor(
    private readonly dashboard: OperationsDashboardService,
    private readonly inspector: CallInspectorService,
    private readonly audit: EnterpriseAuditService,
    private readonly health: EnterpriseHealthService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Live operations dashboard snapshot (read-only)' })
  dashboardSnapshot(@Query('tenantId') tenantId?: string) {
    return this.dashboard.snapshot(tenantId);
  }

  @Get('diagnostics/calls')
  @ApiOperation({ summary: 'Call Inspector — search by platformUuid, extension, time range' })
  async callDiagnostics(@Query() query: CallDiagnosticsQueryDto) {
    if (query.platformUuid) {
      return this.inspector.inspectByPlatformUuid(query.tenantId, query.platformUuid);
    }
    return this.inspector.search(query);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Immutable audit log query (append-only)' })
  auditQuery(@Query() query: AuditQueryDto) {
    return this.audit.query(query);
  }

  @Get('health/detail')
  @ApiOperation({ summary: 'Detailed infrastructure health (all components)' })
  healthDetail() {
    return this.health.checkAll();
  }
}
