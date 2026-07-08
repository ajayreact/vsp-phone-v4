import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelecomServiceAuthGuard } from '../../../common/telecom/telecom-service-auth.guard';
import { ProvisioningRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { RenderProvisioningRequestDto } from '../dto/provisioning.request.dto';
import { RenderProvisioningResponseDto } from '../dto/provisioning.response.dto';
import { ProvisioningOrchestratorService } from '../orchestrator/provisioning-orchestrator.service';

@ApiTags('provisioning-internal')
@Controller('v1/internal/provisioning')
@UseGuards(TelecomServiceAuthGuard, ProvisioningRateLimitGuard)
export class ProvisioningInternalController {
  constructor(private readonly orchestrator: ProvisioningOrchestratorService) {}

  @Post('render')
  @ApiOperation({ summary: 'Internal config render trigger (Phase 11)' })
  render(@Body() dto: RenderProvisioningRequestDto): Promise<RenderProvisioningResponseDto> {
    return this.orchestrator.renderDevice(dto.deviceId, dto.tenantId);
  }
}
