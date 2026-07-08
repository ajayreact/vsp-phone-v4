import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { HA_EVENTS } from '../events/ha.events';
import { redisModeLabel } from '../../../common/redis/redis-connection.factory';

/** Phase 17 — Redis HA health monitoring and reconnect coordination. */
@Injectable()
export class RedisHaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisHaService.name);
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(this.config.get('REDIS_HEALTH_INTERVAL_MS') ?? '30000');
    if (intervalMs <= 0) return;
    this.monitorTimer = setInterval(() => {
      void this.probe();
    }, intervalMs);
    void this.probe();
  }

  onModuleDestroy(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
  }

  async probe(): Promise<{ available: boolean; mode: string; latencyMs?: number }> {
    const started = Date.now();
    const available = this.redis.isAvailable();
    const pong = available ? await this.redis.ping() : null;
    const ok = pong === 'PONG';
    const latencyMs = Date.now() - started;

    if (!ok && available) {
      this.logger.warn(JSON.stringify({ event: 'ha.redis.degraded', mode: redisModeLabel(this.config) }));
      this.events.emit(HA_EVENTS.REDIS_DEGRADED, { latencyMs });
    } else if (ok) {
      this.events.emit(HA_EVENTS.REDIS_RECOVERED, { latencyMs });
    }

    return { available: ok, mode: redisModeLabel(this.config), latencyMs };
  }

  async reconnect(): Promise<boolean> {
    const ok = await this.redis.reconnect();
    if (ok) {
      this.logger.log(JSON.stringify({ event: 'ha.redis.reconnected' }));
      this.events.emit(HA_EVENTS.REDIS_RECOVERED, {});
    }
    return ok;
  }

  describeConfig(): Record<string, unknown> {
    return {
      mode: redisModeLabel(this.config),
      sentinelName: this.config.get('REDIS_SENTINEL_NAME'),
      clusterNodes: this.config.get('REDIS_CLUSTER_NODES'),
      retryMaxAttempts: this.config.get('REDIS_RETRY_MAX_ATTEMPTS'),
      healthIntervalMs: this.config.get('REDIS_HEALTH_INTERVAL_MS'),
    };
  }
}
