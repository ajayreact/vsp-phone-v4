import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthRateLimitGuard } from '../enterprise-security/guards/scoped-rate-limit.guards';
import { AuthService } from './auth.service';
import {
  ImpersonationExchangeDto,
  ImpersonationExitResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  LogoutResponseDto,
  MeResponseDto,
  RefreshTokenIssueResponseDto,
  RefreshTokenRequestDto,
} from './dto/auth.dto';
import { getJwtUser, JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({
    summary: 'Portal-bound user JWT login',
    description:
      'Requires portal (platform|ops|tenant). Platform admins cannot login on tenant portal.',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Portal access denied' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Refresh access token (preserves portal claim)' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  refresh(@Body() dto: RefreshTokenRequestDto): Promise<LoginResponseDto> {
    return this.auth.refreshAccessToken(dto.refreshToken);
  }

  @Post('refresh-token/issue')
  @UseGuards(JwtAuthGuard, AuthRateLimitGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issue refresh token for current session' })
  @ApiResponse({ status: 200, type: RefreshTokenIssueResponseDto })
  issueRefreshToken(@Req() req: Request): Promise<RefreshTokenIssueResponseDto> {
    const user = getJwtUser(req);
    return this.auth.issueRefreshToken({
      userId: user.sub,
      tenantId: user.tenantId,
      email: user.email,
      portal: user.portal,
      impersonatorUserId: user.impersonatorUserId,
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Secure logout — invalidate session' })
  @ApiResponse({ status: 200, type: LogoutResponseDto })
  logout(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
  ): Promise<LogoutResponseDto> {
    const user = getJwtUser(req);
    return this.auth.logout({
      userId: user.sub,
      tenantId: user.tenantId,
      refreshToken: body?.refreshToken,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile, roles, permissions, portal' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  me(@Req() req: Request): Promise<MeResponseDto> {
    const user = getJwtUser(req);
    return this.auth.me(
      user.sub,
      user.tenantId,
      user.email,
      user.portal,
      user.impersonatorUserId,
    );
  }

  @Post('impersonation/exchange')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({
    summary: 'Redeem one-time session handoff (tenant impersonation or platform restore)',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  exchangeImpersonation(@Body() dto: ImpersonationExchangeDto): Promise<LoginResponseDto> {
    return this.auth.exchangeImpersonationHandoff(dto.code);
  }

  @Post('impersonation/exit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Exit tenant impersonation — returns handoff code for platform portal',
  })
  @ApiResponse({ status: 200, type: ImpersonationExitResponseDto })
  exitImpersonation(@Req() req: Request): Promise<ImpersonationExitResponseDto> {
    return this.auth.exitImpersonation(getJwtUser(req));
  }
}
