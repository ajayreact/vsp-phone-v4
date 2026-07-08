import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

/** Phase 16 — secure HTTP response headers (non-breaking defaults). */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(_req: Request, res: Response, next: NextFunction): void {
    if (this.config.get('SECURITY_HEADERS_ENABLED') === 'false') {
      next();
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(self), geolocation=(), payment=()',
    );

    const csp = this.config.get<string>('SECURITY_CSP');
    if (csp) {
      res.setHeader('Content-Security-Policy', csp);
    }

    const hstsMax = Number(this.config.get('SECURITY_HSTS_MAX_AGE_SEC') ?? '0');
    const tls =
      this.config.get('TLS_ENABLED') === true ||
      String(this.config.get('TLS_ENABLED')).toLowerCase() === 'true';
    if (tls && hstsMax > 0) {
      res.setHeader('Strict-Transport-Security', `max-age=${hstsMax}; includeSubDomains`);
    }

    next();
  }
}
