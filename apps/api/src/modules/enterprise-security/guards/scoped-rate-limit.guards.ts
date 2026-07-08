import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../rate-limit/rate-limit.service';

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Phase 16 — authentication endpoint rate limiting. */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { allowed } = await this.rateLimit.check('auth', clientKey(req));
    if (!allowed) {
      throw new HttpException('Too many authentication attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/** Phase 16 — WebRTC signalling rate limiting. */
@Injectable()
export class WebrtcRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { allowed } = await this.rateLimit.check('webrtc', clientKey(req));
    if (!allowed) {
      throw new HttpException('WebRTC rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/** Phase 16 — provisioning API rate limiting. */
@Injectable()
export class ProvisioningRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { allowed } = await this.rateLimit.check('provisioning', clientKey(req));
    if (!allowed) {
      throw new HttpException('Provisioning rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/** Phase 16 — JWT admin API rate limiting. */
@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { allowed } = await this.rateLimit.check('admin', clientKey(req));
    if (!allowed) {
      throw new HttpException('Admin API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
