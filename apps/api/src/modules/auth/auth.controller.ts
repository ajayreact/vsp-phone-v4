import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthRateLimitGuard } from '../enterprise-security/guards/scoped-rate-limit.guards';
import { AuthService } from './auth.service';
import {
  LoginRequestDto,
  LoginResponseDto,
  LogoutResponseDto,
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
    summary: 'User JWT login (Phase 10 browser softphone)',
    description: 'App-plane auth for WebRTC enroll. Prisma User or DEV_AUTH_* lab credentials.',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Refresh access token (Phase 16 additive)' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  refresh(@Body() dto: RefreshTokenRequestDto): Promise<LoginResponseDto> {
    return this.auth.refreshAccessToken(dto.refreshToken);
  }

  @Post('refresh-token/issue')
  @UseGuards(JwtAuthGuard, AuthRateLimitGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issue refresh token for current session (Phase 16 additive)' })
  @ApiResponse({ status: 200, type: RefreshTokenIssueResponseDto })
  issueRefreshToken(@Req() req: Request): Promise<RefreshTokenIssueResponseDto> {
    const user = getJwtUser(req);
    return this.auth.issueRefreshToken({
      userId: user.sub,
      tenantId: user.tenantId,
      email: user.email,
    });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Secure logout — invalidate session (Phase 16 additive)' })
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
}
