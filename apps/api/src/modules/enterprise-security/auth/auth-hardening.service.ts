import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

/** Phase 16 — failed login tracking, lockout, session invalidation. */
@Injectable()
export class AuthHardeningService {
  constructor(
    private readonly redis: TelecomRedisService,
    private readonly config: ConfigService,
  ) {}

  async assertNotLocked(email: string): Promise<void> {
    const key = this.redis.authLockoutKey(email.toLowerCase());
    const locked = await this.redis.get(key);
    if (locked) {
      throw new UnauthorizedException('Account temporarily locked');
    }
  }

  async recordFailure(email: string): Promise<void> {
    const normalized = email.toLowerCase();
    const failKey = this.redis.authFailuresKey(normalized);
    const count = await this.redis.incr(failKey);
    if (count === 1) {
      await this.redis.expire(failKey, this.windowSec());
    }
    const maxFailures = Number(this.config.get('AUTH_LOCKOUT_THRESHOLD') ?? '5');
    if (count >= maxFailures) {
      await this.redis.setex(
        this.redis.authLockoutKey(normalized),
        this.lockoutSec(),
        new Date().toISOString(),
      );
    }
  }

  async clearFailures(email: string): Promise<void> {
    const normalized = email.toLowerCase();
    await this.redis.del(
      this.redis.authFailuresKey(normalized),
      this.redis.authLockoutKey(normalized),
    );
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    await this.redis.setex(
      this.redis.sessionRevokedKey(userId),
      Number(this.config.get('JWT_ACCESS_TTL_SEC') ?? '3600'),
      Date.now().toString(),
    );
  }

  async isSessionRevoked(userId: string, tokenIssuedAtSec: number): Promise<boolean> {
    const raw = await this.redis.get(this.redis.sessionRevokedKey(userId));
    if (!raw) return false;
    const revokedAt = Number(raw);
    return tokenIssuedAtSec * 1000 <= revokedAt;
  }

  private windowSec(): number {
    return Number(this.config.get('AUTH_FAILURE_WINDOW_SEC') ?? '900');
  }

  private lockoutSec(): number {
    return Number(this.config.get('AUTH_LOCKOUT_DURATION_SEC') ?? '900');
  }
}
