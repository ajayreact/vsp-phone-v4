import type { ConfigService } from '@nestjs/config';

/** Phase 17 — trusted proxy / load balancer configuration. */
export function parseTrustedProxies(config: ConfigService): string[] {
  const raw = config.get<string>('TRUSTED_PROXIES') ?? '';
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function resolveClientIp(params: {
  forwardedFor?: string | string[];
  realIp?: string;
  remoteAddress?: string;
}): string {
  if (typeof params.realIp === 'string' && params.realIp.length > 0) {
    return params.realIp;
  }
  const forwarded = params.forwardedFor;
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return params.remoteAddress ?? 'unknown';
}
