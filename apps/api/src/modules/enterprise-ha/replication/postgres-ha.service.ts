import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { HA_EVENTS } from '../events/ha.events';

/** Phase 17 — PostgreSQL HA: pool tuning, reconnect, read-replica probe. */
@Injectable()
export class PostgresHaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresHaService.name);
  private readClient: PrismaClient | null = null;
  private readConnected = false;
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectReadReplica();
    const intervalMs = Number(this.config.get('POSTGRES_HEALTH_INTERVAL_MS') ?? '30000');
    if (intervalMs > 0) {
      this.monitorTimer = setInterval(() => {
        void this.probePrimary();
      }, intervalMs);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    if (this.readClient) {
      await this.readClient.$disconnect().catch(() => undefined);
    }
  }

  async reconnectPrimary(): Promise<boolean> {
    try {
      if (this.prisma.connected) {
        await this.prisma.$disconnect();
      }
      await this.prisma.$connect();
      this.prisma.connected = true;
      this.logger.log(JSON.stringify({ event: 'ha.postgres.reconnected' }));
      this.events.emit(HA_EVENTS.POSTGRES_RECOVERED, {});
      return true;
    } catch (err) {
      this.prisma.connected = false;
      this.logger.warn(
        JSON.stringify({
          event: 'ha.postgres.reconnect_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return false;
    }
  }

  async probePrimary(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
    const started = Date.now();
    if (!this.prisma.connected) {
      this.events.emit(HA_EVENTS.POSTGRES_DEGRADED, { reason: 'not connected' });
      return { status: 'down' };
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (err) {
      this.prisma.connected = false;
      this.events.emit(HA_EVENTS.POSTGRES_DEGRADED, {
        reason: err instanceof Error ? err.message : String(err),
      });
      return { status: 'down' };
    }
  }

  async probeReadReplica(): Promise<{ status: 'up' | 'down' | 'skipped'; latencyMs?: number }> {
    const readUrl = this.config.get<string>('DATABASE_READ_URL');
    if (!readUrl) return { status: 'skipped' };
    if (!this.readClient || !this.readConnected) {
      await this.connectReadReplica();
    }
    if (!this.readClient || !this.readConnected) return { status: 'down' };
    const started = Date.now();
    try {
      await this.readClient.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - started };
    } catch {
      this.readConnected = false;
      return { status: 'down' };
    }
  }

  describeConfig(): Record<string, unknown> {
    return {
      poolMax: this.config.get('DATABASE_POOL_MAX'),
      connectTimeoutMs: this.config.get('DATABASE_CONNECT_TIMEOUT_MS'),
      readReplicaConfigured: Boolean(this.config.get('DATABASE_READ_URL')),
      retryMaxAttempts: this.config.get('DATABASE_RETRY_MAX_ATTEMPTS'),
    };
  }

  private async connectReadReplica(): Promise<void> {
    const readUrl = this.config.get<string>('DATABASE_READ_URL');
    if (!readUrl) return;
    try {
      const adapter = new PrismaPg({
        connectionString: readUrl,
        max: Number(this.config.get('DATABASE_POOL_MAX') ?? '5'),
        connectionTimeoutMillis: Number(
          this.config.get('DATABASE_CONNECT_TIMEOUT_MS') ?? '5000',
        ),
      });
      this.readClient = new PrismaClient({ adapter });
      await this.readClient.$connect();
      this.readConnected = true;
      this.logger.log(JSON.stringify({ event: 'ha.postgres.read_replica.connected' }));
    } catch (err) {
      this.readConnected = false;
      this.logger.warn(
        JSON.stringify({
          event: 'ha.postgres.read_replica.failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
