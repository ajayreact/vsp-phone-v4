import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Phase 16 — centralized secret presence checks (never log values). */
@Injectable()
export class SecretValidationService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.validateAtRuntime();
  }

  validateAtRuntime(): void {
    const env = this.config.get<string>('VSP_ENV') ?? 'development';
    if (env !== 'production') return;

    this.require('JWT_SECRET');
    this.require('TELECOM_SERVICE_AUTH_TOKEN');
    this.require('DATABASE_URL');
    this.require('REDIS_URL');

    if (!this.config.get('TELNYX_WEBHOOK_SECRET')) {
      throw new Error('TELNYX_WEBHOOK_SECRET is required in production');
    }
    if (this.config.get<boolean>('TLS_ENABLED') !== true) {
      throw new Error('TLS_ENABLED must be true in production');
    }
  }

  private require(key: string): void {
    const value = this.config.get<string>(key);
    if (!value?.trim()) {
      throw new Error(`Missing required secret: ${key}`);
    }
  }
}
