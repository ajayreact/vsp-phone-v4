export type EnvironmentProfile = 'development' | 'testing' | 'staging' | 'production';

const PROFILE_ALIASES: Record<string, EnvironmentProfile> = {
  development: 'development',
  dev: 'development',
  testing: 'testing',
  test: 'testing',
  staging: 'staging',
  stage: 'staging',
  production: 'production',
  prod: 'production',
};

/** Phase 18 — environment profile resolution and validation strictness. */
export function resolveEnvironmentProfile(raw: string | undefined): EnvironmentProfile {
  const key = (raw ?? 'development').trim().toLowerCase();
  return PROFILE_ALIASES[key] ?? 'development';
}

export interface ProfileValidationPolicy {
  profile: EnvironmentProfile;
  requireTls: boolean;
  requireJwtSecret: boolean;
  requireTelecomServiceAuth: boolean;
  requireTelnyxWebhook: boolean;
  requireBackupLocation: boolean;
  probeInfrastructure: boolean;
}

export function profileValidationPolicy(profile: EnvironmentProfile): ProfileValidationPolicy {
  switch (profile) {
    case 'production':
      return {
        profile,
        requireTls: true,
        requireJwtSecret: true,
        requireTelecomServiceAuth: true,
        requireTelnyxWebhook: true,
        requireBackupLocation: true,
        probeInfrastructure: true,
      };
    case 'staging':
      return {
        profile,
        requireTls: true,
        requireJwtSecret: true,
        requireTelecomServiceAuth: true,
        requireTelnyxWebhook: false,
        requireBackupLocation: false,
        probeInfrastructure: true,
      };
    case 'testing':
      return {
        profile,
        requireTls: false,
        requireJwtSecret: false,
        requireTelecomServiceAuth: false,
        requireTelnyxWebhook: false,
        requireBackupLocation: false,
        probeInfrastructure: false,
      };
    default:
      return {
        profile: 'development',
        requireTls: false,
        requireJwtSecret: false,
        requireTelecomServiceAuth: false,
        requireTelnyxWebhook: false,
        requireBackupLocation: false,
        probeInfrastructure: false,
      };
  }
}
