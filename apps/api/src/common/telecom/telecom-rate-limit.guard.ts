import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../../modules/enterprise-security/rate-limit/rate-limit.service';

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Phase 16 — Redis rate limiting for telecom hot paths.
 * Returns HTTP 429 + TELECOM_RATE_LIMITED via TelecomExceptionFilter.
 */
@Injectable()
export class TelecomRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(TelecomRateLimitGuard.name);

  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const { allowed, remaining } = await this.rateLimit.check('telecom', clientKey(req));
    if (!allowed) {
      this.logger.warn(
        JSON.stringify({
          event: 'telecom.ratelimit.exceeded',
          path: req.originalUrl || req.url,
          method: req.method,
        }),
      );
      throw new HttpException('Telecom rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.logger.debug(
      JSON.stringify({
        event: 'telecom.ratelimit.pass',
        path: req.originalUrl || req.url,
        remaining,
      }),
    );
    return true;
  }
}
