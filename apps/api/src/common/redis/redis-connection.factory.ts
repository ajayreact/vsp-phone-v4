import type { ConfigService } from '@nestjs/config';
import Redis, { Cluster } from 'ioredis';

export type RedisClient = Redis | Cluster;
export type RedisMode = 'standalone' | 'sentinel' | 'cluster';

export interface RedisHostPort {
  host: string;
  port: number;
}

export function parseHostList(raw: string, defaultPort: number): RedisHostPort[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.includes(':')) {
        const [host, portRaw] = part.split(':');
        return { host: host.trim(), port: Number(portRaw) || defaultPort };
      }
      return { host: part, port: defaultPort };
    });
}

/** Phase 17 — Redis standalone / Sentinel / Cluster connection factory. */
export function createRedisClient(config: ConfigService): RedisClient {
  const mode = (config.get<string>('REDIS_MODE') ?? 'standalone') as RedisMode;
  const retryMax = Number(config.get('REDIS_RETRY_MAX_ATTEMPTS') ?? '10');

  const common = {
    maxRetriesPerRequest: Number(config.get('REDIS_MAX_RETRIES') ?? '3'),
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: Number(config.get('REDIS_CONNECT_TIMEOUT_MS') ?? '2000'),
    retryStrategy: (times: number) => {
      if (times > retryMax) return null;
      return Math.min(times * 200, 3000);
    },
    reconnectOnError: (err: Error) => {
      const msg = err.message.toLowerCase();
      return msg.includes('readonly') || msg.includes('connect') || msg.includes('econnrefused');
    },
  };

  if (mode === 'sentinel') {
    const sentinels = parseHostList(
      config.get<string>('REDIS_SENTINEL_HOSTS') ?? '',
      26379,
    );
    const name = config.get<string>('REDIS_SENTINEL_NAME') ?? 'mymaster';
    if (sentinels.length === 0) {
      throw new Error('REDIS_SENTINEL_HOSTS required when REDIS_MODE=sentinel');
    }
    return new Redis({
      ...common,
      sentinels,
      name,
      sentinelRetryStrategy: common.retryStrategy,
    });
  }

  if (mode === 'cluster') {
    const nodes = parseHostList(
      config.get<string>('REDIS_CLUSTER_NODES') ??
        config.get<string>('REDIS_URL')?.replace(/^redis:\/\//, '') ??
        '',
      6379,
    );
    if (nodes.length === 0) {
      throw new Error('REDIS_CLUSTER_NODES required when REDIS_MODE=cluster');
    }
    return new Cluster(nodes, {
      redisOptions: common,
      clusterRetryStrategy: common.retryStrategy,
    });
  }

  const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
  return new Redis(url, common);
}

export function redisModeLabel(config: ConfigService): RedisMode {
  return (config.get<string>('REDIS_MODE') ?? 'standalone') as RedisMode;
}
