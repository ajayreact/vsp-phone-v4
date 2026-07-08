/**
 * Phase 1 environment validation for the NestJS API.
 * Fails fast on missing critical variables in non-test environments.
 */

export type ApiEnv = {
  NODE_ENV: string;
  VSP_ENV: string;
  PORT: number;
  API_GLOBAL_PREFIX: string;
  LOG_LEVEL: string;
  LOG_FORMAT: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  REDIS_HOST: string;
  REDIS_PORT: number;
  TLS_ENABLED: boolean;
  TLS_ENV: string;
  TLS_API_CERT_FILE?: string;
  TLS_API_KEY_FILE?: string;
  TLS_CA_FILE?: string;
  TELECOM_SERVICE_AUTH_TOKEN?: string;
  SWAGGER_ENABLED: boolean;
  SIP_PLATFORM_DOMAIN: string;
  SIP_DEV_PASSWORD?: string;
  SIP_VAULT_JSON?: string;
  SIP_DEFAULT_EXPIRES_SEC: number;
  TELNYX_SIP_HOST: string;
  TELNYX_DISPATCHER_SET: number;
  TELNYX_WEBHOOK_SECRET?: string;
  TELNYX_API_BASE_URL: string;
  JWT_SECRET?: string;
  DEV_JWT_SECRET?: string;
  JWT_ACCESS_TTL_SEC: number;
  DEV_AUTH_EMAIL?: string;
  DEV_AUTH_PASSWORD?: string;
  DEV_AUTH_USER_ID?: string;
  DEV_AUTH_TENANT_ID?: string;
  WEBRTC_WSS_URL?: string;
  WEBRTC_ENROLL_TTL_SEC: number;
  WEBRTC_STUN_URL?: string;
  WEBRTC_TURN_URL?: string;
  WEBRTC_TURN_USERNAME?: string;
  WEBRTC_TURN_PASSWORD?: string;
  KAMAILIO_WSS_PORT: number;
  PROV_HTTPS_ENABLED: boolean;
  PROV_HTTPS_PORT: number;
  PROV_PUBLIC_BASE_URL?: string;
  PROV_ARTIFACT_ROOT: string;
  PROV_TLS_VALIDATE: boolean;
  PROV_FIRMWARE_STABLE_VERSION: string;
  PROV_FIRMWARE_N1_VERSION: string;
  PROV_FIRMWARE_EMERGENCY_VERSION: string;
  SIP_REGISTRAR_HOST?: string;
  SIP_PORT: number;
  RECORDING_ENABLED: boolean;
  RECORDING_UPLOAD_ENABLED: boolean;
  S3_ENDPOINT?: string;
  S3_BUCKET_RECORDINGS: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_REGION: string;
  QUEUE_MEDIA_URI?: string;
  IVR_MEDIA_URI?: string;
  CONFERENCE_MEDIA_URI?: string;
  VOICEMAIL_MEDIA_URI?: string;
  MOH_DEFAULT_URI?: string;
  PROMPT_BASE_URI?: string;
  QUEUE_WAIT_SEC: number;
  QUEUE_RETRY_MAX: number;
  QUEUE_OVERFLOW_DEST?: string;
  IVR_TIMEOUT_SEC: number;
  PARK_SLOT_COUNT: number;
  PAGING_MEDIA_URI?: string;
  INTERCOM_MEDIA_URI?: string;
  SUPERVISOR_MEDIA_URI?: string;
  /** Phase 16 — security hardening */
  SECURITY_ENFORCE_TELECOM?: boolean;
  SECURITY_HEADERS_ENABLED?: boolean;
  SECURITY_HSTS_MAX_AGE_SEC?: number;
  SECURITY_CSP?: string;
  RATE_LIMIT_WINDOW_SEC?: number;
  RATE_LIMIT_AUTH_MAX?: number;
  RATE_LIMIT_TELECOM_MAX?: number;
  RATE_LIMIT_WEBRTC_MAX?: number;
  RATE_LIMIT_PROVISIONING_MAX?: number;
  RATE_LIMIT_ADMIN_MAX?: number;
  RATE_LIMIT_PUBLIC_MAX?: number;
  AUTH_LOCKOUT_THRESHOLD?: number;
  AUTH_LOCKOUT_DURATION_SEC?: number;
  AUTH_FAILURE_WINDOW_SEC?: number;
  JWT_REFRESH_TTL_SEC?: number;
  PASSWORD_MIN_LENGTH?: number;
  PASSWORD_REQUIRE_UPPERCASE?: boolean;
  PASSWORD_REQUIRE_NUMBER?: boolean;
  PASSWORD_REQUIRE_SPECIAL?: boolean;
  REQUEST_BODY_MAX_BYTES?: string;
  /** Phase 17 — high availability & scalability */
  INSTANCE_ID?: string;
  REDIS_MODE?: string;
  REDIS_SENTINEL_HOSTS?: string;
  REDIS_SENTINEL_NAME?: string;
  REDIS_CLUSTER_NODES?: string;
  REDIS_MAX_RETRIES?: number;
  REDIS_RETRY_MAX_ATTEMPTS?: number;
  REDIS_CONNECT_TIMEOUT_MS?: number;
  REDIS_HEALTH_INTERVAL_MS?: number;
  DATABASE_READ_URL?: string;
  DATABASE_POOL_MAX?: number;
  DATABASE_CONNECT_TIMEOUT_MS?: number;
  DATABASE_RETRY_MAX_ATTEMPTS?: number;
  POSTGRES_HEALTH_INTERVAL_MS?: number;
  KAMAILIO_HTTP_HOST?: string;
  KAMAILIO_HTTP_PORT?: number;
  KAMAILIO_NODES?: string;
  KAMAILIO_RPC_ENDPOINTS?: string;
  KAMAILIO_HEALTH_INTERVAL_MS?: number;
  RTPENGINE_HOST?: string;
  RTPENGINE_NG_PORT?: number;
  RTPENGINE_NODES?: string;
  RTPENGINE_HEALTH_INTERVAL_MS?: number;
  TRUST_PROXY?: boolean;
  TRUSTED_PROXIES?: string;
  SHUTDOWN_DRAIN_MS?: number;
  READINESS_STRICT?: boolean;
  BACKUP_LOCATION?: string;
  HA_RESTORE_VERIFY_ENABLED?: boolean;
  HA_CONFIG_SNAPSHOT_ON_START?: boolean;
  /** Phase 18 — production platform */
  RELEASE_NUMBER?: string;
  BUILD_GIT_COMMIT?: string;
  BUILD_TIMESTAMP?: string;
  BACKUP_SCHEDULE?: string;
  BACKUP_POSTGRES_HOOK_CMD?: string;
  /** Remediation — Kamailio operational settings (reported via API env) */
  KAMAILIO_REQUIRE_SERVICE_AUTH?: boolean;
  KAMAILIO_USRLOC_PERSISTENCE?: string;
  KAMAILIO_USRLOC_DB_URL?: string;
  /** Phase 19 — migration toolkit */
  MIGRATION_SUPER_ADMIN_PERMISSION?: string;
  MIGRATION_DEV_SUPER_ADMIN?: boolean;
  MIGRATION_REQUIRE_READINESS?: boolean;
};

function requireString(env: NodeJS.ProcessEnv, key: string, fallback?: string): string {
  const value = env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requirePort(env: NodeJS.ProcessEnv, key: string, fallback: string): number {
  const raw = env[key] ?? fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Environment variable ${key} must be a valid TCP port`);
  }
  return port;
}

function assertProductionSecurity(env: NodeJS.ProcessEnv): void {
  const vspEnv = env.VSP_ENV ?? 'development';
  if (vspEnv !== 'production') return;

  requireString(env, 'JWT_SECRET');
  requireString(env, 'TELECOM_SERVICE_AUTH_TOKEN');
  if (!env.TELNYX_WEBHOOK_SECRET?.trim()) {
    throw new Error('TELNYX_WEBHOOK_SECRET is required when VSP_ENV=production');
  }
  if ((env.TLS_ENABLED ?? 'false').toLowerCase() !== 'true') {
    throw new Error('TLS_ENABLED must be true when VSP_ENV=production');
  }
}

export function validateEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isTest = nodeEnv === 'test';

  assertProductionSecurity(env);

  const databaseUrl = isTest
    ? (env.DATABASE_URL ?? 'postgresql://vsp:vsp@localhost:5432/vsp_phone?schema=public')
    : requireString(env, 'DATABASE_URL');
  const redisUrl = isTest
    ? (env.REDIS_URL ?? 'redis://localhost:6379')
    : requireString(env, 'REDIS_URL');

  return {
    NODE_ENV: nodeEnv,
    VSP_ENV: env.VSP_ENV ?? 'development',
    PORT: requirePort(env, 'PORT', '3000'),
    API_GLOBAL_PREFIX: env.API_GLOBAL_PREFIX ?? 'api',
    LOG_LEVEL: env.LOG_LEVEL ?? 'info',
    LOG_FORMAT: env.LOG_FORMAT ?? 'json',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    POSTGRES_HOST: env.POSTGRES_HOST ?? 'localhost',
    POSTGRES_PORT: requirePort(env, 'POSTGRES_PORT', '5432'),
    REDIS_HOST: env.REDIS_HOST ?? 'localhost',
    REDIS_PORT: requirePort(env, 'REDIS_PORT', '6379'),
    TLS_ENABLED: (env.TLS_ENABLED ?? 'false').toLowerCase() === 'true',
    TLS_ENV: env.TLS_ENV ?? 'development',
    TLS_API_CERT_FILE: env.TLS_API_CERT_FILE,
    TLS_API_KEY_FILE: env.TLS_API_KEY_FILE,
    TLS_CA_FILE: env.TLS_CA_FILE,
    TELECOM_SERVICE_AUTH_TOKEN: env.TELECOM_SERVICE_AUTH_TOKEN,
    SWAGGER_ENABLED: (env.SWAGGER_ENABLED ?? 'true').toLowerCase() !== 'false',
    SIP_PLATFORM_DOMAIN: env.SIP_PLATFORM_DOMAIN ?? 'vsp.internal',
    SIP_DEV_PASSWORD: env.SIP_DEV_PASSWORD,
    SIP_VAULT_JSON: env.SIP_VAULT_JSON,
    SIP_DEFAULT_EXPIRES_SEC: Number(env.SIP_DEFAULT_EXPIRES_SEC ?? '3600'),
    TELNYX_SIP_HOST: env.TELNYX_SIP_HOST ?? 'sip.telnyx.com',
    TELNYX_DISPATCHER_SET: Number(env.TELNYX_DISPATCHER_SET ?? '2'),
    TELNYX_WEBHOOK_SECRET: env.TELNYX_WEBHOOK_SECRET,
    TELNYX_API_BASE_URL: env.TELNYX_API_BASE_URL ?? 'https://api.telnyx.com/v2',
    JWT_SECRET: env.JWT_SECRET,
    DEV_JWT_SECRET: env.DEV_JWT_SECRET,
    JWT_ACCESS_TTL_SEC: Number(env.JWT_ACCESS_TTL_SEC ?? '3600'),
    DEV_AUTH_EMAIL: env.DEV_AUTH_EMAIL,
    DEV_AUTH_PASSWORD: env.DEV_AUTH_PASSWORD,
    DEV_AUTH_USER_ID: env.DEV_AUTH_USER_ID,
    DEV_AUTH_TENANT_ID: env.DEV_AUTH_TENANT_ID,
    WEBRTC_WSS_URL: env.WEBRTC_WSS_URL,
    WEBRTC_ENROLL_TTL_SEC: Number(env.WEBRTC_ENROLL_TTL_SEC ?? '900'),
    WEBRTC_STUN_URL: env.WEBRTC_STUN_URL,
    WEBRTC_TURN_URL: env.WEBRTC_TURN_URL,
    WEBRTC_TURN_USERNAME: env.WEBRTC_TURN_USERNAME,
    WEBRTC_TURN_PASSWORD: env.WEBRTC_TURN_PASSWORD,
    KAMAILIO_WSS_PORT: requirePort(env, 'KAMAILIO_WSS_PORT', '8443'),
    PROV_HTTPS_ENABLED: (env.PROV_HTTPS_ENABLED ?? 'true').toLowerCase() !== 'false',
    PROV_HTTPS_PORT: requirePort(env, 'PROV_HTTPS_PORT', '3444'),
    PROV_PUBLIC_BASE_URL: env.PROV_PUBLIC_BASE_URL,
    PROV_ARTIFACT_ROOT: env.PROV_ARTIFACT_ROOT ?? './data/provisioning',
    PROV_TLS_VALIDATE: (env.PROV_TLS_VALIDATE ?? 'true').toLowerCase() !== 'false',
    PROV_FIRMWARE_STABLE_VERSION: env.PROV_FIRMWARE_STABLE_VERSION ?? '1.0.5.12',
    PROV_FIRMWARE_N1_VERSION: env.PROV_FIRMWARE_N1_VERSION ?? '1.0.5.11',
    PROV_FIRMWARE_EMERGENCY_VERSION: env.PROV_FIRMWARE_EMERGENCY_VERSION ?? '1.0.5.10',
    SIP_REGISTRAR_HOST: env.SIP_REGISTRAR_HOST,
    SIP_PORT: requirePort(env, 'SIP_PORT', '5061'),
    RECORDING_ENABLED: (env.RECORDING_ENABLED ?? 'true').toLowerCase() !== 'false',
    RECORDING_UPLOAD_ENABLED: (env.RECORDING_UPLOAD_ENABLED ?? 'true').toLowerCase() !== 'false',
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_BUCKET_RECORDINGS: env.S3_BUCKET_RECORDINGS ?? 'vsp-recordings',
    S3_ACCESS_KEY: env.S3_ACCESS_KEY ?? env.MINIO_ROOT_USER,
    S3_SECRET_KEY: env.S3_SECRET_KEY ?? env.MINIO_ROOT_PASSWORD,
    S3_REGION: env.S3_REGION ?? 'us-east-1',
    QUEUE_MEDIA_URI: env.QUEUE_MEDIA_URI,
    IVR_MEDIA_URI: env.IVR_MEDIA_URI,
    CONFERENCE_MEDIA_URI: env.CONFERENCE_MEDIA_URI,
    VOICEMAIL_MEDIA_URI: env.VOICEMAIL_MEDIA_URI,
    MOH_DEFAULT_URI: env.MOH_DEFAULT_URI,
    PROMPT_BASE_URI: env.PROMPT_BASE_URI,
    QUEUE_WAIT_SEC: Number(env.QUEUE_WAIT_SEC ?? '60'),
    QUEUE_RETRY_MAX: Number(env.QUEUE_RETRY_MAX ?? '2'),
    QUEUE_OVERFLOW_DEST: env.QUEUE_OVERFLOW_DEST,
    IVR_TIMEOUT_SEC: Number(env.IVR_TIMEOUT_SEC ?? '10'),
    PARK_SLOT_COUNT: Number(env.PARK_SLOT_COUNT ?? '20'),
    PAGING_MEDIA_URI: env.PAGING_MEDIA_URI,
    INTERCOM_MEDIA_URI: env.INTERCOM_MEDIA_URI,
    SUPERVISOR_MEDIA_URI: env.SUPERVISOR_MEDIA_URI,
    SECURITY_ENFORCE_TELECOM: (() => {
      if (env.SECURITY_ENFORCE_TELECOM !== undefined) {
        return String(env.SECURITY_ENFORCE_TELECOM).toLowerCase() === 'true';
      }
      const vsp = (env.VSP_ENV ?? 'development').toLowerCase();
      return vsp === 'production' || vsp === 'prod';
    })(),
    SECURITY_HEADERS_ENABLED:
      (env.SECURITY_HEADERS_ENABLED ?? 'true').toLowerCase() !== 'false',
    SECURITY_HSTS_MAX_AGE_SEC: Number(env.SECURITY_HSTS_MAX_AGE_SEC ?? '0'),
    SECURITY_CSP: env.SECURITY_CSP,
    RATE_LIMIT_WINDOW_SEC: Number(env.RATE_LIMIT_WINDOW_SEC ?? '60'),
    RATE_LIMIT_AUTH_MAX: Number(env.RATE_LIMIT_AUTH_MAX ?? '20'),
    RATE_LIMIT_TELECOM_MAX: Number(env.RATE_LIMIT_TELECOM_MAX ?? '600'),
    RATE_LIMIT_WEBRTC_MAX: Number(env.RATE_LIMIT_WEBRTC_MAX ?? '120'),
    RATE_LIMIT_PROVISIONING_MAX: Number(env.RATE_LIMIT_PROVISIONING_MAX ?? '60'),
    RATE_LIMIT_ADMIN_MAX: Number(env.RATE_LIMIT_ADMIN_MAX ?? '300'),
    RATE_LIMIT_PUBLIC_MAX: Number(env.RATE_LIMIT_PUBLIC_MAX ?? '100'),
    AUTH_LOCKOUT_THRESHOLD: Number(env.AUTH_LOCKOUT_THRESHOLD ?? '5'),
    AUTH_LOCKOUT_DURATION_SEC: Number(env.AUTH_LOCKOUT_DURATION_SEC ?? '900'),
    AUTH_FAILURE_WINDOW_SEC: Number(env.AUTH_FAILURE_WINDOW_SEC ?? '900'),
    JWT_REFRESH_TTL_SEC: Number(env.JWT_REFRESH_TTL_SEC ?? '86400'),
    PASSWORD_MIN_LENGTH: Number(env.PASSWORD_MIN_LENGTH ?? '8'),
    PASSWORD_REQUIRE_UPPERCASE:
      (env.PASSWORD_REQUIRE_UPPERCASE ?? 'false').toLowerCase() === 'true',
    PASSWORD_REQUIRE_NUMBER:
      (env.PASSWORD_REQUIRE_NUMBER ?? 'false').toLowerCase() === 'true',
    PASSWORD_REQUIRE_SPECIAL:
      (env.PASSWORD_REQUIRE_SPECIAL ?? 'false').toLowerCase() === 'true',
    REQUEST_BODY_MAX_BYTES: env.REQUEST_BODY_MAX_BYTES ?? '1mb',
    INSTANCE_ID: env.INSTANCE_ID,
    REDIS_MODE: env.REDIS_MODE ?? 'standalone',
    REDIS_SENTINEL_HOSTS: env.REDIS_SENTINEL_HOSTS,
    REDIS_SENTINEL_NAME: env.REDIS_SENTINEL_NAME ?? 'mymaster',
    REDIS_CLUSTER_NODES: env.REDIS_CLUSTER_NODES,
    REDIS_MAX_RETRIES: Number(env.REDIS_MAX_RETRIES ?? '3'),
    REDIS_RETRY_MAX_ATTEMPTS: Number(env.REDIS_RETRY_MAX_ATTEMPTS ?? '10'),
    REDIS_CONNECT_TIMEOUT_MS: Number(env.REDIS_CONNECT_TIMEOUT_MS ?? '2000'),
    REDIS_HEALTH_INTERVAL_MS: Number(env.REDIS_HEALTH_INTERVAL_MS ?? '30000'),
    DATABASE_READ_URL: env.DATABASE_READ_URL,
    DATABASE_POOL_MAX: Number(env.DATABASE_POOL_MAX ?? '10'),
    DATABASE_CONNECT_TIMEOUT_MS: Number(env.DATABASE_CONNECT_TIMEOUT_MS ?? '5000'),
    DATABASE_RETRY_MAX_ATTEMPTS: Number(env.DATABASE_RETRY_MAX_ATTEMPTS ?? '3'),
    POSTGRES_HEALTH_INTERVAL_MS: Number(env.POSTGRES_HEALTH_INTERVAL_MS ?? '30000'),
    KAMAILIO_HTTP_HOST: env.KAMAILIO_HTTP_HOST ?? 'localhost',
    KAMAILIO_HTTP_PORT: requirePort(env, 'KAMAILIO_HTTP_PORT', '8880'),
    KAMAILIO_NODES: env.KAMAILIO_NODES,
    KAMAILIO_RPC_ENDPOINTS: env.KAMAILIO_RPC_ENDPOINTS,
    KAMAILIO_HEALTH_INTERVAL_MS: Number(env.KAMAILIO_HEALTH_INTERVAL_MS ?? '30000'),
    RTPENGINE_HOST: env.RTPENGINE_HOST ?? 'localhost',
    RTPENGINE_NG_PORT: requirePort(env, 'RTPENGINE_NG_PORT', '2223'),
    RTPENGINE_NODES: env.RTPENGINE_NODES,
    RTPENGINE_HEALTH_INTERVAL_MS: Number(env.RTPENGINE_HEALTH_INTERVAL_MS ?? '30000'),
    TRUST_PROXY: (env.TRUST_PROXY ?? 'false').toLowerCase() === 'true',
    TRUSTED_PROXIES: env.TRUSTED_PROXIES,
    SHUTDOWN_DRAIN_MS: Number(env.SHUTDOWN_DRAIN_MS ?? '30000'),
    READINESS_STRICT: (env.READINESS_STRICT ?? 'false').toLowerCase() === 'true',
    BACKUP_LOCATION: env.BACKUP_LOCATION,
    HA_RESTORE_VERIFY_ENABLED:
      (env.HA_RESTORE_VERIFY_ENABLED ?? 'true').toLowerCase() !== 'false',
    HA_CONFIG_SNAPSHOT_ON_START:
      (env.HA_CONFIG_SNAPSHOT_ON_START ?? 'false').toLowerCase() === 'true',
    RELEASE_NUMBER: env.RELEASE_NUMBER,
    BUILD_GIT_COMMIT: env.BUILD_GIT_COMMIT ?? env.GIT_COMMIT,
    BUILD_TIMESTAMP: env.BUILD_TIMESTAMP,
    BACKUP_SCHEDULE: env.BACKUP_SCHEDULE,
    BACKUP_POSTGRES_HOOK_CMD: env.BACKUP_POSTGRES_HOOK_CMD,
    KAMAILIO_REQUIRE_SERVICE_AUTH:
      (env.KAMAILIO_REQUIRE_SERVICE_AUTH ?? 'false').toLowerCase() === 'true',
    KAMAILIO_USRLOC_PERSISTENCE: env.KAMAILIO_USRLOC_PERSISTENCE ?? 'memory',
    KAMAILIO_USRLOC_DB_URL: env.KAMAILIO_USRLOC_DB_URL,
    MIGRATION_SUPER_ADMIN_PERMISSION:
      env.MIGRATION_SUPER_ADMIN_PERMISSION ?? 'platform:super_admin',
    MIGRATION_DEV_SUPER_ADMIN:
      (env.MIGRATION_DEV_SUPER_ADMIN ?? 'true').toLowerCase() !== 'false',
    MIGRATION_REQUIRE_READINESS:
      (env.MIGRATION_REQUIRE_READINESS ?? 'false').toLowerCase() === 'true',
  };
}
