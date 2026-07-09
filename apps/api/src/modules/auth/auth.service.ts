import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { AuthHardeningService } from '../enterprise-security/auth/auth-hardening.service';
import { PermissionsService } from '../enterprise-security/auth/permissions.service';
import { RefreshTokenService } from '../enterprise-security/auth/refresh-token.service';
import { SecurityAuditService } from '../enterprise-security/audit/security-audit.service';
import { PrismaService } from '../telecom/prisma/prisma.service';
import type { LoginRequestDto, LoginResponseDto, MeResponseDto } from './dto/auth.dto';
import { signJwt } from './jwt.util';

/**
 * Phase 10 — User JWT for browser softphone enroll (ADR-007 app plane).
 * Phase 16 — login hardening, refresh tokens, secure logout (flow unchanged).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly hardening: AuthHardeningService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly securityAudit: SecurityAuditService,
    private readonly permissions: PermissionsService,
  ) {
    this.jwtTtlSec = Number(this.config.get('JWT_ACCESS_TTL_SEC') ?? '3600');
  }

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    await this.hardening.assertNotLocked(dto.email);

    const secret = this.jwtSecret();
    const dev = this.tryDevLogin(dto);
    if (dev) {
      await this.hardening.clearFailures(dto.email);
      const token = signJwt(
        { sub: dev.userId, tenantId: dev.tenantId, email: dev.email },
        secret,
        this.jwtTtlSec,
      );
      this.securityAudit.login({
        tenantId: dev.tenantId,
        userId: dev.userId,
        email: dev.email,
      });
      return {
        accessToken: token,
        tokenType: 'Bearer',
        expiresInSec: this.jwtTtlSec,
        userId: dev.userId,
        tenantId: dev.tenantId,
        email: dev.email,
      };
    }

    if (!this.prisma.connected) {
      throw new UnauthorizedException('Authentication unavailable');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        email: { equals: dto.email, mode: 'insensitive' },
        status: { in: [UserStatus.ACTIVE, UserStatus.PENDING] },
      },
    });
    if (!user || !this.verifyPassword(dto.password, user.passwordHash)) {
      await this.hardening.recordFailure(dto.email);
      this.securityAudit.failedLogin({ email: dto.email, reason: 'invalid_credentials' });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.hardening.clearFailures(dto.email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signJwt(
      { sub: user.id, tenantId: user.tenantId, email: user.email },
      secret,
      this.jwtTtlSec,
    );

    this.securityAudit.login({
      tenantId: user.tenantId,
      userId: user.id,
      email: user.email,
    });

    this.logger.log(
      JSON.stringify({ event: 'auth.login', userId: user.id, tenantId: user.tenantId }),
    );

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresInSec: this.jwtTtlSec,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<LoginResponseDto> {
    const record = await this.refreshTokens.validate(refreshToken);
    await this.hardening.assertNotLocked(record.email);
    const secret = this.jwtSecret();
    const token = signJwt(
      { sub: record.userId, tenantId: record.tenantId, email: record.email },
      secret,
      this.jwtTtlSec,
    );
    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresInSec: this.jwtTtlSec,
      userId: record.userId,
      tenantId: record.tenantId,
      email: record.email,
    };
  }

  async issueRefreshToken(params: {
    userId: string;
    tenantId: string;
    email: string;
  }): Promise<{ refreshToken: string; expiresInSec: number }> {
    return this.refreshTokens.issue(params);
  }

  async logout(params: {
    userId: string;
    tenantId: string;
    refreshToken?: string;
  }): Promise<{ ok: true }> {
    await this.hardening.invalidateUserSessions(params.userId);
    if (params.refreshToken) {
      await this.refreshTokens.revoke(params.refreshToken);
    }
    this.securityAudit.logout({ tenantId: params.tenantId, userId: params.userId });
    return { ok: true };
  }

  async me(userId: string, tenantId: string, email: string): Promise<MeResponseDto> {
    const permissionKeys = await this.permissions.userPermissions(userId);
    const uniquePermissions = [...new Set(permissionKeys)];

    if (!this.prisma.connected) {
      const devPerms = this.devPermissions(userId, email);
      return {
        userId,
        tenantId,
        email,
        permissions: devPerms.length ? devPerms : uniquePermissions,
        roles: [],
      };
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        profile: true,
        tenant: { select: { id: true, name: true, slug: true } },
        userRoles: {
          where: { deletedAt: null },
          include: { role: { select: { id: true, name: true } } },
        },
      },
    });

    const roles = (user?.userRoles ?? [])
      .map((ur) => ur.role)
      .filter((r) => r?.name)
      .map((r) => ({ id: r.id, name: r.name }));

    return {
      userId,
      tenantId,
      email,
      permissions: uniquePermissions,
      roles,
      tenant: user?.tenant
        ? { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug }
        : undefined,
      profile: user?.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            displayName: user.profile.displayName,
          }
        : undefined,
    };
  }

  private jwtSecret(): string {
    const secret =
      this.config.get<string>('JWT_SECRET') || this.config.get<string>('DEV_JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('JWT secret not configured');
    }
    return secret;
  }

  private tryDevLogin(dto: LoginRequestDto): {
    userId: string;
    tenantId: string;
    email: string;
  } | null {
    const email = (this.config.get<string>('DEV_AUTH_EMAIL') || '').trim().toLowerCase();
    const password = this.config.get<string>('DEV_AUTH_PASSWORD') || '';
    const userId = (this.config.get<string>('DEV_AUTH_USER_ID') || '').trim();
    const tenantId = (this.config.get<string>('DEV_AUTH_TENANT_ID') || '').trim();
    if (!email || !password || !userId || !tenantId) return null;
    if (dto.email.toLowerCase() !== email || dto.password !== password) return null;
    return { userId, tenantId, email: dto.email };
  }

  private devPermissions(userId: string, email: string): string[] {
    const dev = this.tryDevLogin({ email, password: this.config.get<string>('DEV_AUTH_PASSWORD') || '' });
    if (!dev || dev.userId !== userId) return [];
    return [
      'platform:super_admin',
      'tenant:admin',
      'provisioning:admin',
      'recordings:read',
      'presence:read',
      'presence:write',
    ];
  }

  /** scrypt$N$r$saltB64$hashB64 (5 segments when split on $) */
  private verifyPassword(plain: string, stored: string): boolean {
    if (stored.startsWith('scrypt$')) {
      const parts = stored.split('$');
      if (parts.length !== 5) return false;
      const saltB64 = parts[3];
      const hashB64 = parts[4];
      if (!saltB64 || !hashB64) return false;
      const salt = Buffer.from(saltB64, 'base64');
      const expected = Buffer.from(hashB64, 'base64');
      const N = Number.parseInt(parts[1] ?? '16384', 10) || 16384;
      const r = Number.parseInt(parts[2] ?? '8', 10) || 8;
      const derived = scryptSync(plain, salt, expected.length, { N, r });
      return timingSafeEqual(derived, expected);
    }
    return false;
  }
}
