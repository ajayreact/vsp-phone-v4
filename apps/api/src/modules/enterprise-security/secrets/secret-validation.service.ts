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
    const tlsEnabled =
      this.config.get<boolean>('TLS_ENABLED') === true ||
      String(this.config.get('TLS_ENABLED')).toLowerCase() === 'true';
    const termination = String(this.config.get('TLS_TERMINATION') ?? '')
      .toLowerCase()
      .trim();
    const edgeTls =
      termination === 'nginx' || termination === 'edge' || termination === 'external';
    if (!tlsEnabled && !edgeTls) {
      throw new Error(
        'Production requires TLS_ENABLED=true or TLS_TERMINATION=nginx|edge (external HTTPS termination)',
      );
    }
  }

  private require(key: string): void {
    const value = this.config.get<string>(key);
    if (!value?.trim()) {
      throw new Error(`Missing required secret: ${key}`);
    }
  }
}
