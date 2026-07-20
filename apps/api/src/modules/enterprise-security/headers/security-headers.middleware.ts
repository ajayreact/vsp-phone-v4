import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import {
  pipelineEnter,
  pipelineExit,
  pipelineReqId,
} from '../../auth/login-pipeline-trace';

/** Phase 16 — secure HTTP response headers (non-breaking defaults). */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const isLogin = req.method === 'POST' && /\/v1\/auth\/login\/?$/.test(req.path);
    const reqId = isLogin ? pipelineReqId(req) : '';
    const t0 = isLogin ? pipelineEnter('middleware.security_headers', reqId) : 0;
    if (isLogin) {
      (req as Request & { vspPipelineReqId?: string }).vspPipelineReqId = reqId;
    }

    if (this.config.get('SECURITY_HEADERS_ENABLED') === 'false') {
      if (isLogin) pipelineExit('middleware.security_headers', reqId, t0);
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

    if (isLogin) pipelineExit('middleware.security_headers', reqId, t0);
    next();
  }
}
