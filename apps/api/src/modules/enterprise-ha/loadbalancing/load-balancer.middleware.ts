import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import {
  pipelineEnter,
  pipelineExit,
  pipelineReqId,
} from '../../auth/login-pipeline-trace';
import { parseTrustedProxies, resolveClientIp } from './trusted-proxy.config';

export const CLIENT_IP_KEY = 'clientIp';

/** Phase 17 — load balancer awareness: forwarded headers + trusted proxies. */
@Injectable()
export class LoadBalancerMiddleware implements NestMiddleware {
  private readonly trustProxy: boolean;
  private readonly trustedProxies: string[];

  constructor(private readonly config: ConfigService) {
    this.trustProxy =
      String(this.config.get('TRUST_PROXY') ?? 'false').toLowerCase() === 'true';
    this.trustedProxies = parseTrustedProxies(this.config);
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const isLogin = req.method === 'POST' && /\/v1\/auth\/login\/?$/.test(req.path);
    const reqId =
      (req as Request & { vspPipelineReqId?: string }).vspPipelineReqId ||
      (isLogin ? pipelineReqId(req) : '');
    const t0 = isLogin ? pipelineEnter('middleware.load_balancer', reqId) : 0;

    if (!this.trustProxy) {
      (req as Request & { [CLIENT_IP_KEY]?: string })[CLIENT_IP_KEY] =
        req.ip || req.socket.remoteAddress || 'unknown';
      if (isLogin) pipelineExit('middleware.load_balancer', reqId, t0);
      next();
      return;
    }

    const remote = req.socket.remoteAddress ?? '';
    const fromTrusted = this.isTrusted(remote);
    const clientIp = fromTrusted
      ? resolveClientIp({
          forwardedFor: req.headers['x-forwarded-for'],
          realIp: req.headers['x-real-ip'] as string | undefined,
          remoteAddress: remote,
        })
      : req.ip || remote || 'unknown';

    (req as Request & { [CLIENT_IP_KEY]?: string })[CLIENT_IP_KEY] = clientIp;
    if (isLogin) pipelineExit('middleware.load_balancer', reqId, t0);
    next();
  }

  private isTrusted(remoteAddress: string): boolean {
    if (this.trustedProxies.length === 0) return true;
    return this.trustedProxies.some(
      (p) => remoteAddress.includes(p) || p === '*',
    );
  }
}
