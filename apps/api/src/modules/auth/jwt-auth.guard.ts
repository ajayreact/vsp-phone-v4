import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthHardeningService } from '../enterprise-security/auth/auth-hardening.service';
import { verifyJwt, type JwtPayload } from './jwt.util';

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
    (req as Request & { [JWT_USER_KEY]: JwtPayload })[JWT_USER_KEY] = payload;
    return true;
  }
}

export function getJwtUser(req: Request): JwtPayload {
  const user = (req as Request & { [JWT_USER_KEY]?: JwtPayload })[JWT_USER_KEY];
  if (!user) {
    throw new UnauthorizedException('JWT context missing');
  }
  return user;
}
