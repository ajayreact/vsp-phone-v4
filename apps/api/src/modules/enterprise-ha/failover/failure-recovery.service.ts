import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../events/ha.events';
import { KamailioNodeRegistryService } from './kamailio-node-registry.service';
import { RtpengineNodeRegistryService } from './rtpengine-node-registry.service';
import { PostgresHaService } from '../replication/postgres-ha.service';
import { RedisHaService } from '../redis/redis-ha.service';

/** Phase 17 — automatic recovery for transient infrastructure loss. */
@Injectable()
export class FailureRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(FailureRecoveryService.name);
  private recovering = new Set<string>();

  constructor(
    private readonly redisHa: RedisHaService,
    private readonly postgresHa: PostgresHaService,
    private readonly kamailio: KamailioNodeRegistryService,
    private readonly rtpengine: RtpengineNodeRegistryService,
  ) {}

  onModuleInit(): void {
    this.logger.log(JSON.stringify({ event: 'ha.recovery.ready' }));
  }

  @OnEvent(HA_EVENTS.REDIS_DEGRADED)
  async onRedisDegraded(): Promise<void> {
    await this.runOnce('redis', async () => {
      await this.redisHa.reconnect();
    });
  }

  @OnEvent(HA_EVENTS.POSTGRES_DEGRADED)
  async onPostgresDegraded(): Promise<void> {
    await this.runOnce('postgres', async () => {
      await this.postgresHa.reconnectPrimary();
    });
  }

  @OnEvent(HA_EVENTS.KAMAILIO_NODE_DOWN)
  async onKamailioDown(): Promise<void> {
    await this.runOnce('kamailio', async () => {
      await this.kamailio.checkAll();
    });
  }

  @OnEvent(HA_EVENTS.RTPENGINE_NODE_DOWN)
  async onRtpengineDown(): Promise<void> {
    await this.runOnce('rtpengine', async () => {
      await this.rtpengine.checkAll();
    });
  }

  @OnEvent(HA_EVENTS.CARRIER_DEGRADED)
  onCarrierDegraded(payload: { reason?: string }): void {
    this.logger.warn(
      JSON.stringify({
        event: 'ha.carrier.degraded',
        reason: payload?.reason,
        note: 'active calls not terminated by API restart',
      }),
    );
  }

  private async runOnce(key: string, fn: () => Promise<void>): Promise<void> {
    if (this.recovering.has(key)) return;
    this.recovering.add(key);
    try {
      await fn();
    } finally {
      this.recovering.delete(key);
    }
  }
}
