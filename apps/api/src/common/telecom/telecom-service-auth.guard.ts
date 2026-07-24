import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { TELECOM_HEADERS } from './telecom.headers';
import { TelecomErrorCode } from './telecom.errors';

/**
 * Phase 5 stub: service auth for Kamailio → NestJS.
 * When TELECOM_SERVICE_AUTH_TOKEN is unset, allows requests (dev contract mode)
 * but logs a warning. Production must set the shared HMAC/token (mTLS later).
 */
@Injectable()
export class TelecomServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(TelecomServiceAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = (this.config.get<string>('TELECOM_SERVICE_AUTH_TOKEN') || '').trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fromBody = typeof body.serviceAuth === 'string' ? body.serviceAuth.trim() : '';
    const provided = (req.header(TELECOM_HEADERS.SERVICE_AUTH) || fromBody || '').trim();

    if (!expected) {
      this.logger.warn(
        JSON.stringify({
          event: 'telecom.auth.stub_open',
          message: 'TELECOM_SERVICE_AUTH_TOKEN unset — allowing request (Phase 5 stub)',
          path: req.originalUrl || req.url,
        }),
      );
      return true;
    }

    if (!provided || provided !== expected) {
      throw new UnauthorizedException({
        code: TelecomErrorCode.UNAUTHORIZED,
        message: 'Missing or invalid telecom service credentials',
      });
    }

    return true;
  }
}
