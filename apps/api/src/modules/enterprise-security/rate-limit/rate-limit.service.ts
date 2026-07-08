import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

export type RateLimitScope =
  | 'auth'
  | 'telecom'
  | 'webrtc'
  | 'provisioning'
  | 'admin'
  | 'public';

/** Phase 16 — Redis sliding-window rate limiting (configurable via env). */
@Injectable()
export class RateLimitService {
  constructor(
    private readonly redis: TelecomRedisService,
    private readonly config: ConfigService,
  ) {}

  async check(scope: RateLimitScope, identifier: string): Promise<{ allowed: boolean; remaining: number }> {
    const limit = this.limitFor(scope);
    const windowSec = this.windowFor(scope);
    if (limit <= 0) return { allowed: true, remaining: limit };

    const key = this.redis.rateLimitKey(scope, identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSec);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }

  private limitFor(scope: RateLimitScope): number {
    const map: Record<RateLimitScope, string> = {
      auth: 'RATE_LIMIT_AUTH_MAX',
      telecom: 'RATE_LIMIT_TELECOM_MAX',
      webrtc: 'RATE_LIMIT_WEBRTC_MAX',
      provisioning: 'RATE_LIMIT_PROVISIONING_MAX',
      admin: 'RATE_LIMIT_ADMIN_MAX',
      public: 'RATE_LIMIT_PUBLIC_MAX',
    };
    const defaults: Record<RateLimitScope, number> = {
      auth: 20,
      telecom: 600,
      webrtc: 120,
      provisioning: 60,
      admin: 300,
      public: 100,
    };
    return Number(this.config.get(map[scope]) ?? String(defaults[scope]));
  }

  private windowFor(scope: RateLimitScope): number {
    return Number(this.config.get('RATE_LIMIT_WINDOW_SEC') ?? '60');
  }
}
