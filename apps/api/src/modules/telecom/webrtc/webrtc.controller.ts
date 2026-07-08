import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTelecomContext, type TelecomRequestContext } from '../../../common/telecom/telecom.context';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WebrtcRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import type {
  WebrtcEnrollRequestDto,
  WebrtcEnrollRevokeRequestDto,
  PresenceRequestDto,
} from '../dto/telecom.request.dto';
import {
  WebrtcEnrollResponseDto,
  WebrtcEnrollRevokeResponseDto,
  PresenceResponseDto,
} from '../dto/telecom.response.dto';
import { BrowserPresenceService } from './browser-presence.service';
import { WebrtcEnrollService } from './webrtc-enroll.service';

@ApiTags('telecom-webrtc')
@ApiBearerAuth()
@Controller('v1/telecom/webrtc')
@UseGuards(JwtAuthGuard, WebrtcRateLimitGuard)
export class WebrtcController {
  constructor(
    private readonly enrollService: WebrtcEnrollService,
    private readonly presence: BrowserPresenceService,
  ) {}

  @Post('enroll')
  @ApiOperation({
    summary: 'WebRTC SIP enrollment (Phase 10)',
    description:
      'JWT-gated short-lived SIP credentials + WSS URL + ICE servers. ADR-038. No SDP stored.',
  })
  @ApiResponse({ status: 200, type: WebrtcEnrollResponseDto })
  enrollWebRtc(
    @Body() dto: WebrtcEnrollRequestDto,
    @Req() req: Request,
  ): Promise<WebrtcEnrollResponseDto> {
    return this.enrollService.enroll(getJwtUser(req), dto);
  }

  @Post('enroll/revoke')
  @ApiOperation({ summary: 'Revoke WebRTC enroll credentials' })
  @ApiResponse({ status: 200, type: WebrtcEnrollRevokeResponseDto })
  revoke(
    @Body() dto: WebrtcEnrollRevokeRequestDto,
    @Req() req: Request,
  ): Promise<WebrtcEnrollRevokeResponseDto> {
    return this.enrollService.revoke(getJwtUser(req), dto);
  }

  @Post('presence')
  @ApiOperation({ summary: 'Browser presence update (Phase 10)' })
  @ApiResponse({ status: 200, type: PresenceResponseDto })
  browserPresence(
    @Body() dto: PresenceRequestDto,
    @Req() req: Request,
  ): Promise<PresenceResponseDto> {
    return this.presence.updateFromBrowser(getJwtUser(req), dto, this.meta(req));
  }

  private meta(req: Request) {
    const fromAls = getTelecomContext();
    const attached = (req as Request & { telecomContext?: TelecomRequestContext }).telecomContext;
    const ctx = fromAls || attached;
    return {
      requestId: ctx?.requestId || 'unknown',
      correlationId: ctx?.correlationId || ctx?.requestId || 'unknown',
      platformUuid: ctx?.platformUuid,
      idempotencyKey: ctx?.idempotencyKey,
    };
  }
}
