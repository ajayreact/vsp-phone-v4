import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KamailioPersistenceReport {
  mode: 'memory' | 'postgres';
  restartSafe: boolean;
  serviceAuthConfigured: boolean;
  detail: string;
}

/** Remediation H-06 — Kamailio usrloc persistence and service auth reporting. */
@Injectable()
export class KamailioPersistenceService {
  constructor(private readonly config: ConfigService) {}

  evaluate(): KamailioPersistenceReport {
    const mode = this.config.get<string>('KAMAILIO_USRLOC_PERSISTENCE') === 'postgres' ? 'postgres' : 'memory';
    const serviceAuthConfigured = Boolean(this.config.get<string>('TELECOM_SERVICE_AUTH_TOKEN')?.trim());
    const kamailioAuthRequired =
      String(this.config.get('KAMAILIO_REQUIRE_SERVICE_AUTH') ?? 'false').toLowerCase() === 'true';

    return {
      mode,
      restartSafe: mode === 'postgres',
      serviceAuthConfigured,
      detail:
        mode === 'postgres'
          ? 'PostgreSQL usrloc persistence enabled (restart-safe registrations)'
          : 'Memory usrloc — registrations require client re-register after Kamailio restart',
    };
  }

  validateProduction(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const vspEnv = this.config.get('VSP_ENV') ?? 'development';
    if (vspEnv !== 'production' && vspEnv !== 'prod') {
      return { ok: true, errors };
    }
    if (!this.config.get<string>('TELECOM_SERVICE_AUTH_TOKEN')?.trim()) {
      errors.push('TELECOM_SERVICE_AUTH_TOKEN required in production');
    }
    const requireAuth =
      String(this.config.get('KAMAILIO_REQUIRE_SERVICE_AUTH') ?? 'true').toLowerCase() === 'true';
    if (requireAuth && !this.config.get<string>('TELECOM_SERVICE_AUTH_TOKEN')?.trim()) {
      errors.push('KAMAILIO_REQUIRE_SERVICE_AUTH=true but token missing');
    }
    return { ok: errors.length === 0, errors };
  }
}
