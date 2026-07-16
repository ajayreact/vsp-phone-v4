import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthHardeningService } from '../enterprise-security/auth/auth-hardening.service';
import { verifyJwt, type AuthPortal, type JwtPayload } from './jwt.util';

export const JWT_USER_KEY = 'jwtUser';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly hardening: AuthHardeningService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = this.config.get<string>('JWT_SECRET') || this.config.get<string>('DEV_JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('JWT not configured');
    }
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const payload = verifyJwt(token, secret);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.iat && (await this.hardening.isSessionRevoked(payload.sub, payload.iat))) {
      throw new UnauthorizedException('Session invalidated');
    }

    this.assertPortalSurface(req, payload);

    (req as Request & { [JWT_USER_KEY]: JwtPayload })[JWT_USER_KEY] = payload;
    return true;
  }

  private assertPortalSurface(req: Request, user: JwtPayload): void {
    const path = (req.path || req.url || '').split('?')[0] ?? '';
    const expected = inferPortalFromPath(path);
    if (!expected) return;

    if (user.portal !== expected) {
      // Allow ops tokens on some shared carrier paths used by ops portal
      if (expected === 'platform' && user.portal === 'ops' && path.includes('/v1/carriers')) {
        return;
      }
      throw new ForbiddenException(
        `Token portal "${user.portal}" cannot access this ${expected} API surface`,
      );
    }

    if (user.impersonatorUserId && user.portal !== 'tenant') {
      throw new ForbiddenException('Impersonation token is limited to the tenant portal');
    }
  }
}

export function getJwtUser(req: Request): JwtPayload {
  const user = (req as Request & { [JWT_USER_KEY]?: JwtPayload })[JWT_USER_KEY];
  if (!user) {
    throw new UnauthorizedException('JWT context missing');
  }
  return user;
}

function inferPortalFromPath(path: string): AuthPortal | null {
  if (path.includes('/v1/platform')) return 'platform';
  if (path.includes('/v1/tenant')) return 'tenant';
  if (path.includes('/v1/ops')) return 'ops';
  return null;
}
