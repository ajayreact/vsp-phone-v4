import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Shared Prisma client for telecom Phase 6 (Prisma 7 + pg adapter).
 * Phase 17 — connection pool tuning and connect retry.
 * Frozen schema — no migrations from this phase.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  connected = false;

  constructor(private readonly appConfig: ConfigService) {
    const url = appConfig.get<string>('DATABASE_URL');
    const adapter = new PrismaPg({
      connectionString: url,
      max: Number(appConfig.get('DATABASE_POOL_MAX') ?? '10'),
      connectionTimeoutMillis: Number(appConfig.get('DATABASE_CONNECT_TIMEOUT_MS') ?? '5000'),
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    const maxAttempts = Number(this.appConfig.get('DATABASE_RETRY_MAX_ATTEMPTS') ?? '3');
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        this.connected = true;
        this.logger.log(JSON.stringify({ event: 'telecom.prisma.connected', attempt }));
        return;
      } catch (err) {
        this.connected = false;
        this.logger.warn(
          JSON.stringify({
            event: 'telecom.prisma.connect_failed',
            attempt,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
