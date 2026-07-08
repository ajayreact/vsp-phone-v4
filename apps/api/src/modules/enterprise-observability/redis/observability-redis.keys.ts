/** Phase 15 — Redis key layout for observability runtime state (see TelecomRedisService). */
export const OBSERVABILITY_REDIS_KEYS = {
  trace: (tenantId: string, platformUuid: string) => `vsp:${tenantId}:trace:${platformUuid}`,
  audit: (tenantId: string) => `vsp:${tenantId}:audit:stream`,
  dashboard: (tenantId: string) => `vsp:${tenantId}:dashboard:snapshot`,
  metrics: (tenantId: string) => `vsp:${tenantId}:metrics:snapshot`,
  health: (component: string) => `vsp:health:${component}`,
} as const;
