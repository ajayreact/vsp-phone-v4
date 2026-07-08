import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { RequirePermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PatchLinePresenceRequestDto } from '../dto/presence.request.dto';
import { PresenceService } from '../presence.service';
import { PresenceSubscriptionService } from '../subscription/presence-subscription.service';

@ApiTags('presence')
@ApiBearerAuth()
@Controller('v1/presence')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    private readonly subscriptions: PresenceSubscriptionService,
  ) {}

  @Get('lines/:lineId')
  @RequirePermission(PERMISSIONS.PRESENCE_READ)
  @ApiOperation({ summary: 'Get line presence (Phase 12)' })
  getLine(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.presence.getLinePresence(user.tenantId, lineId);
  }

  @Patch('lines/:lineId')
  @RequirePermission(PERMISSIONS.PRESENCE_WRITE)
  @ApiOperation({ summary: 'Admin/manual line presence override' })
  patchLine(
    @Param('lineId') lineId: string,
    @Body() dto: PatchLinePresenceRequestDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.presence.setAdminOverride({
      tenantId: user.tenantId,
      lineId,
      status: dto.status,
      customMessage: dto.customMessage,
      userId: user.sub,
    });
  }

  @Get('subscriptions')
  @RequirePermission(PERMISSIONS.PRESENCE_READ)
  @ApiOperation({ summary: 'Presence subscription foundation (channel names)' })
  subscriptionsFoundation(@Req() req: Request) {
    const user = getJwtUser(req);
    return {
      channels: this.subscriptions.listFoundationChannels(user.tenantId),
      note: 'WebSocket push deferred; subscribe via Redis pub/sub in ops layer',
    };
  }
}
