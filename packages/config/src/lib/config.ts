/**
 * Environment variable helpers for VSP Phone v4.
 */

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getEnvNumber(key: string, defaultValue?: number): number {
  const rawValue = process.env[key];

  if (rawValue === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }

    return defaultValue;
  }

  const parsed = Number(rawValue);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }

  return parsed;
}

/** Returns true when VSP_ENV/NODE_ENV indicates production profile. */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['VSP_ENV'] === 'production' || env['NODE_ENV'] === 'production';
}

export const envKeys = {
  nodeEnv: 'NODE_ENV',
  vspEnv: 'VSP_ENV',
  port: 'PORT',
  apiGlobalPrefix: 'API_GLOBAL_PREFIX',
  databaseUrl: 'DATABASE_URL',
  redisUrl: 'REDIS_URL',
  postgresHost: 'POSTGRES_HOST',
  redisHost: 'REDIS_HOST',
  logLevel: 'LOG_LEVEL',
  logFormat: 'LOG_FORMAT',
} as const;
