import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TelecomServiceAuthGuard } from '../../../common/telecom/telecom-service-auth.guard';
import { MetricsService } from '../metrics/metrics.service';

@ApiTags('observability')
@ApiSecurity('telecom-service-auth')
@Controller('v1/telecom')
@UseGuards(TelecomServiceAuthGuard)
export class TelecomMetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus-compatible metrics (Phase 15)' })
  async exportMetrics(): Promise<string> {
    await this.metricsService.refreshGauges();
    return this.metricsService.exportPrometheus();
  }
}
