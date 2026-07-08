import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
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
    if (!this.trustProxy) {
      (req as Request & { [CLIENT_IP_KEY]?: string })[CLIENT_IP_KEY] =
        req.ip || req.socket.remoteAddress || 'unknown';
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
    next();
  }

  private isTrusted(remoteAddress: string): boolean {
    if (this.trustedProxies.length === 0) return true;
    return this.trustedProxies.some(
      (p) => remoteAddress.includes(p) || p === '*',
    );
  }
}
