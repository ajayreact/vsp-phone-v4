import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Phase 11 — provisioning ops metadata (Redis only; no SIP runtime in Prisma). */
@Injectable()
export class ProvisioningRedisService {
  private client: Redis | null = null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      void this.client.connect().catch(() => undefined);
    } catch {
      this.client = null;
    }
  }

  deviceMetaKey(tenantId: string, deviceId: string): string {
    return `vsp:${tenantId}:prov:device:${deviceId}:meta`;
  }

  macIndexKey(mac: string): string {
    return `vsp:prov:mac:${mac}`;
  }

  quarantineKey(mac: string): string {
    return `vsp:prov:quarantine:${mac}`;
  }

  auditStreamKey(): string {
    return 'vsp:prov:audit';
  }

  artifactHistoryKey(tenantId: string, deviceId: string): string {
    return `vsp:${tenantId}:prov:device:${deviceId}:history`;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, Math.max(60, ttlSec), value);
    } catch {
      /* soft fail */
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value);
    } catch {
      /* soft fail */
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.hset(key, field, value);
    } catch {
      /* soft fail */
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    try {
      return await this.client.hgetall(key);
    } catch {
      return {};
    }
  }

  async lpush(key: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.lpush(key, value);
      await this.client.ltrim(key, 0, 49);
    } catch {
      /* soft fail */
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.lrange(key, start, stop);
    } catch {
      return [];
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      /* soft fail */
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }
}
