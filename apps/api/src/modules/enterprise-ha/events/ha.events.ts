export const HA_EVENTS = {
  REDIS_DEGRADED: 'ha.redis.degraded',
  REDIS_RECOVERED: 'ha.redis.recovered',
  POSTGRES_DEGRADED: 'ha.postgres.degraded',
  POSTGRES_RECOVERED: 'ha.postgres.recovered',
  KAMAILIO_NODE_DOWN: 'ha.kamailio.node.down',
  KAMAILIO_NODE_UP: 'ha.kamailio.node.up',
  RTPENGINE_NODE_DOWN: 'ha.rtpengine.node.down',
  RTPENGINE_NODE_UP: 'ha.rtpengine.node.up',
  CARRIER_DEGRADED: 'ha.carrier.degraded',
  SHUTDOWN_START: 'ha.shutdown.start',
  SHUTDOWN_COMPLETE: 'ha.shutdown.complete',
} as const;
