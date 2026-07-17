import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function redactDatabaseUrl(url: string | undefined): string {
  if (!url?.trim()) return '<unset>';
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

function prismaErrorFields(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') {
    return { message: String(err) };
  }
  const e = err as {
    message?: string;
    stack?: string;
    code?: string;
    name?: string;
    clientVersion?: string;
    meta?: unknown;
  };
  return {
    name: e.name,
    code: e.code,
    message: e.message ?? String(err),
    clientVersion: e.clientVersion,
    meta: e.meta,
    stack: e.stack,
  };
}

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
    const databaseUrl = redactDatabaseUrl(this.appConfig.get<string>('DATABASE_URL'));
    this.logger.log(
      JSON.stringify({
        event: 'telecom.prisma.connect_start',
        maxAttempts,
        databaseUrl,
        connectTimeoutMs: Number(this.appConfig.get('DATABASE_CONNECT_TIMEOUT_MS') ?? '5000'),
      }),
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        this.connected = true;
        let currentDatabase: string | undefined;
        let currentUser: string | undefined;
        try {
          const rows = await this.$queryRaw<Array<{ current_database: string; current_user: string }>>`
            SELECT current_database()::text AS current_database, current_user::text AS current_user
          `;
          currentDatabase = rows?.[0]?.current_database;
          currentUser = rows?.[0]?.current_user;
        } catch (identityErr) {
          this.logger.warn(
            JSON.stringify({
              event: 'telecom.prisma.identity_query_failed',
              attempt,
              ...prismaErrorFields(identityErr),
            }),
          );
        }
        this.logger.log(
          JSON.stringify({
            event: 'telecom.prisma.connected',
            attempt,
            maxAttempts,
            prismaConnected: this.connected,
            currentDatabase,
            currentUser,
            databaseUrl,
          }),
        );
        return;
      } catch (err) {
        this.connected = false;
        this.logger.warn(
          JSON.stringify({
            event: 'telecom.prisma.connect_failed',
            attempt,
            maxAttempts,
            prismaConnected: this.connected,
            databaseUrl,
            ...prismaErrorFields(err),
          }),
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }

    this.logger.error(
      JSON.stringify({
        event: 'telecom.prisma.connect_exhausted',
        maxAttempts,
        prismaConnected: this.connected,
        databaseUrl,
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
