import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { RequirePermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  AssignLineRequestDto,
  EnrollDeskPhoneRequestDto,
  ReprovisionRequestDto,
  RollbackProvisioningRequestDto,
} from '../dto/provisioning.request.dto';
import {
  AssignLineResponseDto,
  EnrollDeskPhoneResponseDto,
  ReprovisionResponseDto,
  RollbackResponseDto,
} from '../dto/provisioning.response.dto';
import { DeviceEnrollmentService } from '../enrollment/device-enrollment.service';
import { ProvisioningOrchestratorService } from '../orchestrator/provisioning-orchestrator.service';

@ApiTags('provisioning')
@ApiBearerAuth()
@Controller('v1/provisioning')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class ProvisioningAdminController {
  constructor(
    private readonly enrollment: DeviceEnrollmentService,
    private readonly orchestrator: ProvisioningOrchestratorService,
  ) {}

  @Post('devices/enroll')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Enroll Grandstream desk phone (Phase 11)' })
  enroll(@Body() dto: EnrollDeskPhoneRequestDto, @Req() req: Request): Promise<EnrollDeskPhoneResponseDto> {
    return this.enrollment.enroll(getJwtUser(req), dto);
  }

  @Post('devices/:deviceId/assign')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Assign device to line' })
  assignLine(
    @Param('deviceId') deviceId: string,
    @Body() dto: AssignLineRequestDto,
    @Req() req: Request,
  ): Promise<AssignLineResponseDto> {
    return this.enrollment.assignLine(getJwtUser(req), deviceId, dto.lineId);
  }

  @Post('devices/reprovision')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Trigger device reprovision' })
  reprovision(@Body() dto: ReprovisionRequestDto, @Req() req: Request): Promise<ReprovisionResponseDto> {
    const user = getJwtUser(req);
    return this.orchestrator.reprovision(user.tenantId, dto.deviceId);
  }

  @Post('devices/rollback')
  @RequirePermission(PERMISSIONS.PROVISIONING_ADMIN)
  @ApiOperation({ summary: 'Rollback device configuration version' })
  rollback(@Body() dto: RollbackProvisioningRequestDto, @Req() req: Request): Promise<RollbackResponseDto> {
    const user = getJwtUser(req);
    return this.orchestrator.rollback(user.tenantId, dto.deviceId, dto.targetConfigVersion);
  }
}
