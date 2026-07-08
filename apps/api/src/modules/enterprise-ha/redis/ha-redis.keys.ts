/** Phase 17 — HA runtime Redis keys (additive; existing key layouts unchanged). */
export const HA_REDIS_KEYS = {
  instanceHeartbeat: (instanceId: string) => `vsp:ha:instance:${instanceId}`,
  drainFlag: 'vsp:ha:drain',
  configSnapshot: 'vsp:ha:config:snapshot',
  restoreVerify: 'vsp:ha:restore:verify',
  backupLastExecution: 'vsp:ha:backup:last_execution',
  kamailioNodeHealth: (nodeId: string) => `vsp:ha:kamailio:${nodeId}`,
  rtpengineNodeHealth: (nodeId: string) => `vsp:ha:rtpengine:${nodeId}`,
} as const;
