import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AuthHardeningService } from '../enterprise-security/auth/auth-hardening.service';
import { PermissionsService } from '../enterprise-security/auth/permissions.service';
import { RefreshTokenService } from '../enterprise-security/auth/refresh-token.service';
import { SecurityAuditService } from '../enterprise-security/audit/security-audit.service';
import { TelecomRedisService } from '../telecom/redis/telecom-redis.service';
import { PrismaService } from '../telecom/prisma/prisma.service';
import type { LoginRequestDto, LoginResponseDto, MeResponseDto } from './dto/auth.dto';
import { signJwt, type AuthPortal, type JwtPayload } from './jwt.util';

const IMPERSONATION_TTL_SEC = 45 * 60;
const HANDOFF_TTL_SEC = 90;

/**
 * Phase 10 — User JWT for browser softphone enroll (ADR-007 app plane).
 * Phase 16 — login hardening, refresh tokens, secure logout.
 * Multi-tenant — portal-bound sessions + platform impersonation.
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
    private readonly redis: TelecomRedisService,
  ) {
    this.jwtTtlSec = Number(this.config.get('JWT_ACCESS_TTL_SEC') ?? '3600');
  }

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    await this.hardening.assertNotLocked(dto.email);
    const portal = (dto.portal ?? 'tenant') as AuthPortal;
    const secret = this.jwtSecret();

    const dev = this.tryDevLogin(dto);
    if (dev) {
      await this.hardening.clearFailures(dto.email);
      await this.assertPortalLoginAllowed(dev.userId, portal);
      const token = signJwt(
        { sub: dev.userId, tenantId: dev.tenantId, email: dev.email, portal },
        secret,
        this.jwtTtlSec,
      );
      this.securityAudit.login({
        tenantId: dev.tenantId,
        userId: dev.userId,
        email: dev.email,
      });
      return this.toLoginResponse(token, {
        userId: dev.userId,
        tenantId: dev.tenantId,
        email: dev.email,
        portal,
      });
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

    await this.assertPortalLoginAllowed(user.id, portal);

    await this.hardening.clearFailures(dto.email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signJwt(
      { sub: user.id, tenantId: user.tenantId, email: user.email, portal },
      secret,
      this.jwtTtlSec,
    );

    this.securityAudit.login({
      tenantId: user.tenantId,
      userId: user.id,
      email: user.email,
    });

    this.logger.log(
      JSON.stringify({
        event: 'auth.login',
        userId: user.id,
        tenantId: user.tenantId,
        portal,
      }),
    );

    return this.toLoginResponse(token, {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      portal,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<LoginResponseDto> {
    const record = await this.refreshTokens.validate(refreshToken);
    await this.hardening.assertNotLocked(record.email);
    const secret = this.jwtSecret();
    const token = signJwt(
      {
        sub: record.userId,
        tenantId: record.tenantId,
        email: record.email,
        portal: record.portal,
        impersonatorUserId: record.impersonatorUserId,
      },
      secret,
      this.jwtTtlSec,
    );
    return this.toLoginResponse(token, {
      userId: record.userId,
      tenantId: record.tenantId,
      email: record.email,
      portal: record.portal,
    });
  }

  async issueRefreshToken(params: {
    userId: string;
    tenantId: string;
    email: string;
    portal: AuthPortal;
    impersonatorUserId?: string;
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

  async me(
    userId: string,
    tenantId: string,
    email: string,
    portal: AuthPortal,
    impersonatorUserId?: string,
  ): Promise<MeResponseDto> {
    let permissionKeys = await this.permissions.userPermissions(userId);

    // Impersonation: expose effective tenant-plane permissions for UI gates
    if (impersonatorUserId && portal === 'tenant') {
      const tenantish = [
        'tenant:admin',
        'tenant:users:read',
        'tenant:users:write',
        'tenant:extensions:read',
        'tenant:extensions:write',
        'tenant:devices:read',
        'tenant:devices:write',
        'tenant:dids:read',
        'tenant:dids:write',
        'tenant:settings:read',
        'tenant:settings:write',
        'provisioning:admin',
      ];
      permissionKeys = [...new Set([...permissionKeys, ...tenantish])];
    }

    const uniquePermissions = [...new Set(permissionKeys)];

    if (!this.prisma.connected) {
      const devPerms = this.devPermissions(userId, email);
      return {
        userId,
        tenantId,
        email,
        portal,
        impersonatorUserId,
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

    // For impersonation, show target tenant in /me
    let tenant = user?.tenant
      ? { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug }
      : undefined;
    if (impersonatorUserId && tenantId !== user?.tenantId) {
      const target = await this.prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true, name: true, slug: true },
      });
      if (target) tenant = target;
    }

    const roles = (user?.userRoles ?? [])
      .map((ur) => ur.role)
      .filter((r) => r?.name)
      .map((r) => ({ id: r.id, name: r.name }));

    return {
      userId,
      tenantId,
      email,
      portal,
      impersonatorUserId,
      permissions: uniquePermissions,
      roles,
      tenant,
      profile: user?.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            displayName: user.profile.displayName,
          }
        : undefined,
    };
  }

  /**
   * Platform Admin starts impersonation → one-time handoff code for tenant portal.
   */
  async startImpersonation(actor: JwtPayload, tenantId: string) {
    if (actor.portal !== 'platform') {
      throw new ForbiddenException('Impersonation can only start from the platform portal');
    }
    if (!(await this.permissions.isSuperAdmin(actor.sub))) {
      const canWrite = await this.permissions.userHasPermission(
        actor.sub,
        'platform:tenants:write',
        { portal: 'platform' },
      );
      if (!canWrite) {
        throw new ForbiddenException('Insufficient permissions to impersonate');
      }
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true, slug: true, displayName: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (['platform', 'inventory', 'platform-inventory'].includes(tenant.slug.toLowerCase())) {
      throw new ForbiddenException('Cannot impersonate the platform/inventory tenant');
    }

    const code = randomBytes(24).toString('base64url');
    const handoffKey = `vsp:auth:impersonation:handoff:${code}`;
    await this.redis.setex(
      handoffKey,
      HANDOFF_TTL_SEC,
      JSON.stringify({
        userId: actor.sub,
        tenantId: tenant.id,
        email: actor.email,
        portal: 'tenant' as AuthPortal,
        impersonatorUserId: actor.sub,
        ttlSec: IMPERSONATION_TTL_SEC,
      }),
    );

    this.logger.log(
      JSON.stringify({
        event: 'platform.tenant.impersonate.start',
        actorUserId: actor.sub,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      }),
    );

    return {
      handoffCode: code,
      expiresInSec: HANDOFF_TTL_SEC,
      tenantId: tenant.id,
      tenantName: tenant.displayName || tenant.name,
      tenantSlug: tenant.slug,
    };
  }

  async exchangeImpersonationHandoff(code: string): Promise<LoginResponseDto> {
    const handoffKey = `vsp:auth:impersonation:handoff:${code}`;
    const raw = await this.redis.get(handoffKey);
    if (!raw) {
      throw new UnauthorizedException('Impersonation handoff expired or invalid');
    }
    await this.redis.del(handoffKey);

    let payload: {
      userId: string;
      tenantId: string;
      email: string;
      portal: AuthPortal;
      impersonatorUserId?: string;
      ttlSec?: number;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new UnauthorizedException('Invalid handoff payload');
    }

    if (!payload.userId || !payload.tenantId || !payload.email || !payload.portal) {
      throw new UnauthorizedException('Invalid handoff payload');
    }

    const ttl =
      payload.ttlSec ??
      (payload.portal === 'tenant' && payload.impersonatorUserId
        ? IMPERSONATION_TTL_SEC
        : this.jwtTtlSec);
    const secret = this.jwtSecret();
    const verified = signJwt(
      {
        sub: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        portal: payload.portal,
        ...(payload.impersonatorUserId
          ? { impersonatorUserId: payload.impersonatorUserId }
          : {}),
      },
      secret,
      ttl,
    );

    return {
      accessToken: verified,
      tokenType: 'Bearer',
      expiresInSec: ttl,
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      portal: payload.portal,
    };
  }

  /**
   * Exit impersonation → one-time handoff back to the platform portal
   * (cross-origin; do not store platform tokens under tenant storage keys).
   */
  async exitImpersonation(actor: JwtPayload): Promise<{
    handoffCode: string;
    expiresInSec: number;
  }> {
    if (!actor.impersonatorUserId || actor.portal !== 'tenant') {
      throw new ForbiddenException('Not an impersonation session');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: actor.impersonatorUserId, deletedAt: null },
      select: { id: true, tenantId: true, email: true },
    });
    if (!user) throw new UnauthorizedException('Impersonator account not found');

    const code = randomBytes(24).toString('base64url');
    const handoffKey = `vsp:auth:impersonation:handoff:${code}`;
    await this.redis.setex(
      handoffKey,
      HANDOFF_TTL_SEC,
      JSON.stringify({
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        portal: 'platform' as AuthPortal,
        ttlSec: this.jwtTtlSec,
      }),
    );

    this.logger.log(
      JSON.stringify({
        event: 'platform.tenant.impersonate.exit',
        actorUserId: user.id,
        tenantId: actor.tenantId,
      }),
    );

    return { handoffCode: code, expiresInSec: HANDOFF_TTL_SEC };
  }

  private async assertPortalLoginAllowed(userId: string, portal: AuthPortal): Promise<void> {
    const perms = await this.permissions.userPermissions(userId);
    const isSuperAdmin = await this.permissions.isSuperAdmin(userId);
    const hasTenant = this.permissions.hasTenantPlanePermission(perms);
    const hasPlatform = this.permissions.hasPlatformPlanePermission(perms);
    const hasOps = this.permissions.hasOpsPlanePermission(perms);

    if (portal === 'platform') {
      if (!hasPlatform) {
        throw new ForbiddenException(
          'This account cannot sign in to the Platform Portal. Use the Tenant Portal instead.',
        );
      }
      return;
    }

    if (portal === 'ops') {
      if (!hasOps && !hasPlatform) {
        throw new ForbiddenException('This account cannot sign in to the Operations Portal.');
      }
      return;
    }

    // tenant portal
    if (isSuperAdmin) {
      throw new ForbiddenException(
        'Platform administrators cannot sign in to the Tenant Portal. Open a tenant from the Platform Portal and use Login as Tenant.',
      );
    }
    if (!hasTenant) {
      throw new ForbiddenException('This account cannot sign in to the Tenant Portal.');
    }
  }

  private toLoginResponse(
    accessToken: string,
    parts: { userId: string; tenantId: string; email: string; portal: AuthPortal },
  ): LoginResponseDto {
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSec: parts.portal === 'tenant' && accessToken ? this.jwtTtlSec : this.jwtTtlSec,
      userId: parts.userId,
      tenantId: parts.tenantId,
      email: parts.email,
      portal: parts.portal,
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
    const dev = this.tryDevLogin({
      email,
      password: this.config.get<string>('DEV_AUTH_PASSWORD') || '',
    });
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
