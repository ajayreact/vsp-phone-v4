import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';

export interface RefreshTokenRecord {
  tokenId: string;
  userId: string;
  tenantId: string;
  email: string;
  expiresAt: string;
}

/** Phase 16 — refresh token issue, validation, revocation (Redis; no Prisma). */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly redis: TelecomRedisService,
    private readonly config: ConfigService,
  ) {}

  async issue(params: {
    userId: string;
    tenantId: string;
    email: string;
  }): Promise<{ refreshToken: string; expiresInSec: number }> {
    const tokenId = randomUUID();
    const ttlSec = Number(this.config.get('JWT_REFRESH_TTL_SEC') ?? '86400');
    const record: RefreshTokenRecord = {
      tokenId,
      userId: params.userId,
      tenantId: params.tenantId,
      email: params.email,
      expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    const refreshToken = `${tokenId}.${createHash('sha256').update(tokenId).digest('hex').slice(0, 16)}`;
    await this.redis.setex(this.redis.refreshTokenKey(tokenId), ttlSec, JSON.stringify(record));
    return { refreshToken, expiresInSec: ttlSec };
  }

  async validate(refreshToken: string): Promise<RefreshTokenRecord> {
    const tokenId = refreshToken.split('.')[0];
    if (!tokenId) throw new UnauthorizedException('Invalid refresh token');
    const raw = await this.redis.get(this.redis.refreshTokenKey(tokenId));
    if (!raw) throw new UnauthorizedException('Refresh token expired or revoked');
    try {
      return JSON.parse(raw) as RefreshTokenRecord;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenId = refreshToken.split('.')[0];
    if (tokenId) await this.redis.del(this.redis.refreshTokenKey(tokenId));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    void userId;
    /* Per-token revocation on logout; bulk scan deferred */
  }
}
