import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { RequireAnyPermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { TrunksAdminService } from '../services/trunks-admin.service';

@ApiTags('carriers-trunks')
@ApiBearerAuth()
@Controller('v1/carriers/trunks')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class TrunksAdminController {
  private readonly logger = new Logger(TrunksAdminController.name);

  constructor(private readonly trunks: TrunksAdminService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_CARRIERS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
    PERMISSIONS.OPS_HEALTH_READ,
    PERMISSIONS.OPS_INFRA_READ,
  )
  @ApiOperation({ summary: 'List SIP trunks with live health metrics' })
  async list() {
    try {
      const data = await this.trunks.list();
      return {
        data,
        meta: {
          metricsAvailable: data.length > 0 && data.every((t) => t.metricsAvailable !== false),
          count: data.length,
        },
      };
    } catch (err) {
      this.logger.error(
        `GET /v1/carriers/trunks failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Structured JSON only — never let Nest fall through to HTML error pages.
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'SIP_TRUNKS_UNAVAILABLE',
          message: 'Unable to load SIP trunk metrics',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
