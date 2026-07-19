import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRedisClient, type RedisClient } from '../../../common/redis/redis-connection.factory';

/**
 * Thin Redis wrapper for Phase 6 telecom registration/auth caches.
 * Phase 17 — Sentinel/Cluster support, reconnect, retry strategy.
 * Uses REDIS_URL or REDIS_MODE; fails soft when Redis is unavailable.
 */
@Injectable()
export class TelecomRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(TelecomRedisService.name);
  private client: RedisClient | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {
    try {
      this.client = createRedisClient(this.config);
      this.wireEvents(this.client);
      void this.client.connect().catch((err: Error) => {
        this.available = false;
        this.logger.warn(
          JSON.stringify({
            event: 'telecom.redis.connect_failed',
            message: err.message,
          }),
        );
      });
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'telecom.redis.init_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  private wireEvents(client: RedisClient): void {
    client.on('error', (err: Error) => {
      this.available = false;
      this.logger.warn(
        JSON.stringify({ event: 'telecom.redis.error', message: err.message }),
      );
    });
    client.on('ready', () => {
      this.available = true;
      this.logger.log(JSON.stringify({ event: 'telecom.redis.ready' }));
    });
    client.on('reconnecting', () => {
      this.logger.warn(JSON.stringify({ event: 'telecom.redis.reconnecting' }));
    });
  }

  async reconnect(): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (this.client.status === 'end') {
        this.client = createRedisClient(this.config);
        this.wireEvents(this.client);
      }
      await this.client.connect();
      const pong = await this.client.ping();
      this.available = pong === 'PONG';
      return this.available;
    } catch (err) {
      this.available = false;
      this.logger.warn(
        JSON.stringify({
          event: 'telecom.redis.reconnect_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return false;
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.available) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async setex(key: string, ttlSec: number, value: string): Promise<boolean> {
    if (!this.client || !this.available) return false;
    try {
      await this.client.setex(key, Math.max(1, ttlSec), value);
      return true;
    } catch {
      return false;
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.client || !this.available || keys.length === 0) return 0;
    try {
      return await this.client.del(...keys);
    } catch {
      return 0;
    }
  }

  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.hset(key, field, value);
      return true;
    } catch {
      return false;
    }
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    if (!this.client || fields.length === 0) return 0;
    try {
      return await this.client.hdel(key, ...fields);
    } catch {
      return 0;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    try {
      return await this.client.hgetall(key);
    } catch {
      return {};
    }
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    if (!this.client || !this.available) return false;
    try {
      await this.client.expire(key, Math.max(1, ttlSec));
      return true;
    } catch {
      return false;
    }
  }

  /** Registration location hash: vsp:{tenantId}:reg:{aor} */
  registrationKey(tenantId: string, aor: string): string {
    return `vsp:${tenantId}:reg:${normalizeAor(aor)}`;
  }

  /** Auth allow cache: vsp:auth:sip:{username}:{nonce} */
  authCacheKey(username: string, nonce: string): string {
    return `vsp:auth:sip:${username}:${nonce}`;
  }

  /** Usrloc mirror index by contact digest */
  contactField(contact: string): string {
    return createContactField(contact);
  }

  /** ADR-019: SIP Call-ID → platformUuid (telecom Redis only — never Prisma) */
  corrSipKey(tenantId: string, sipCallId: string): string {
    return `vsp:${tenantId}:corr:sip:${sipCallId}`;
  }

  corrPlatformKey(tenantId: string, platformUuid: string): string {
    return `vsp:${tenantId}:corr:platform:${platformUuid}`;
  }

  /** ADR-019 / TEL-RTP-001: RTPengine session → platformUuid (telecom Redis only) */
  corrRtpKey(tenantId: string, rtpSessionId: string): string {
    return `vsp:${tenantId}:corr:rtp:${rtpSessionId}`;
  }

  /** Phase 10: short-lived WebRTC enroll secret metadata */
  webrtcEnrollKey(tenantId: string, sipEndpointId: string): string {
    return `vsp:${tenantId}:webrtc:enroll:${sipEndpointId}`;
  }

  /** Runtime call cache */
  callRuntimeKey(tenantId: string, platformUuid: string): string {
    return `vsp:${tenantId}:call:${platformUuid}`;
  }

  /** Idempotent resolve: hash(callId+requestUri) */
  routeIdempotencyKey(key: string): string {
    return `vsp:route:idem:${key}`;
  }

  /** ADR-019: Telnyx call id → platformUuid (tenant-scoped) */
  corrTelnyxCallKey(tenantId: string, telnyxCallId: string): string {
    return `vsp:${tenantId}:corr:telnyx:call:${telnyxCallId}`;
  }

  /** Global lookup for webhooks before tenant is known */
  corrTelnyxCallKeyLookup(telnyxCallId: string): string {
    return `vsp:corr:telnyx:call:${telnyxCallId}`;
  }

  corrTelnyxNumberKey(e164: string): string {
    return `vsp:corr:telnyx:number:${e164}`;
  }

  /** Phase 12 — recording active segment per CallSession */
  recordingActiveKey(tenantId: string, platformUuid: string): string {
    return `vsp:${tenantId}:recording:active:${platformUuid}`;
  }

  /** Phase 12 — RTPengine recording session correlation */
  corrRecordingKey(tenantId: string, rtpSessionId: string): string {
    return `vsp:${tenantId}:corr:recording:${rtpSessionId}`;
  }

  /** Phase 12 — line presence runtime cache */
  presenceLineKey(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:presence:line:${lineId}`;
  }

  presenceDeviceKey(tenantId: string, deviceId: string): string {
    return `vsp:${tenantId}:presence:device:${deviceId}`;
  }

  presenceStackKey(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:presence:stack:${lineId}`;
  }

  presenceOverrideKey(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:presence:override:${lineId}`;
  }

  presenceDeviceIndexKey(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:presence:devices:${lineId}`;
  }

  async lpush(key: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.lpush(key, value);
      await this.client.ltrim(key, 0, 19);
    } catch {
      /* soft fail */
    }
  }

  async lpushUnbounded(key: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.lpush(key, value);
    } catch {
      /* soft fail */
    }
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.ltrim(key, start, stop);
    } catch {
      /* soft fail */
    }
  }

  async ping(): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.ping();
    } catch {
      return null;
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.client || !this.available) return 0;
    try {
      return await this.client.incr(key);
    } catch {
      return 0;
    }
  }

  /** Phase 18 — scan keys for non-sensitive config export (bounded). */
  async scanKeys(pattern: string, limit = 200): Promise<string[]> {
    if (!this.client) return [];
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 50);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0' && keys.length < limit);
      return keys.slice(0, limit);
    } catch {
      return [];
    }
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.lrange(key, start, stop);
    } catch {
      return [];
    }
  }

  /** Remediation C-02 — Redis INFO for persistence verification. */
  async info(section?: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return section ? await this.client.info(section) : await this.client.info();
    } catch {
      return null;
    }
  }

  /** Phase 13 — queue runtime session */
  queueSessionKey(tenantId: string, platformUuid: string): string {
    return `vsp:${tenantId}:queue:session:${platformUuid}`;
  }

  queueDepthKey(tenantId: string, queueId: string): string {
    return `vsp:${tenantId}:queue:depth:${queueId}`;
  }

  ivrSessionKey(tenantId: string, platformUuid: string): string {
    return `vsp:${tenantId}:ivr:session:${platformUuid}`;
  }

  conferenceLiveKey(tenantId: string, conferenceId: string): string {
    return `vsp:${tenantId}:conference:live:${conferenceId}`;
  }

  dnisRouteKey(phoneNumberId: string): string {
    return `vsp:dnis:route:${phoneNumberId}`;
  }

  /** Phase 14 — enterprise ops feature code registry */
  opsFeatureKey(tenantId: string, code: string): string {
    return `vsp:${tenantId}:ops:feature:${code}`;
  }

  parkSlotKey(tenantId: string, slot: string): string {
    return `vsp:${tenantId}:ops:park:${slot}`;
  }

  pickupRingingKey(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:ops:pickup:ringing:${lineId}`;
  }

  pickupGroupKey(tenantId: string, groupId: string): string {
    return `vsp:${tenantId}:ops:pickup:group:${groupId}`;
  }

  slaGroupKey(tenantId: string, sharedLineId: string): string {
    return `vsp:${tenantId}:ops:sla:${sharedLineId}`;
  }

  blfSubsKey(tenantId: string, deviceId: string): string {
    return `vsp:${tenantId}:ops:blf:subs:${deviceId}`;
  }

  blfWatchersKey(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:ops:blf:watchers:${lineId}`;
  }

  huntIdleKey(tenantId: string, groupCode: string): string {
    return `vsp:${tenantId}:ops:hunt:idle:${groupCode}`;
  }

  huntRoundRobinKey(tenantId: string, groupCode: string): string {
    return `vsp:${tenantId}:ops:hunt:rr:${groupCode}`;
  }

  supervisorSessionKey(tenantId: string, targetPlatformUuid: string): string {
    return `vsp:${tenantId}:ops:supervisor:${targetPlatformUuid}`;
  }

  presenceSubKey(tenantId: string, deviceId: string): string {
    return `vsp:${tenantId}:presence:sub:device:${deviceId}`;
  }

  presenceNotifyKey(tenantId: string, targetId: string): string {
    return `vsp:${tenantId}:presence:notify:${targetId}`;
  }

  /** Phase 15 — observability runtime keys */
  traceKey(tenantId: string, platformUuid: string): string {
    return `vsp:${tenantId}:trace:${platformUuid}`;
  }

  auditStreamKey(tenantId: string): string {
    return `vsp:${tenantId}:audit:stream`;
  }

  dashboardSnapshotKey(tenantId: string): string {
    return `vsp:${tenantId}:dashboard:snapshot`;
  }

  metricsSnapshotKey(tenantId: string): string {
    return `vsp:${tenantId}:metrics:snapshot`;
  }

  healthSnapshotKey(component: string): string {
    return `vsp:health:${component}`;
  }

  /** Phase 16 — security runtime keys */
  rateLimitKey(scope: string, identifier: string): string {
    return `vsp:security:ratelimit:${scope}:${identifier}`;
  }

  authLockoutKey(identifier: string): string {
    return `vsp:security:auth:lockout:${identifier}`;
  }

  authFailuresKey(identifier: string): string {
    return `vsp:security:auth:failures:${identifier}`;
  }

  refreshTokenKey(tokenId: string): string {
    return `vsp:security:refresh:${tokenId}`;
  }

  revokedTokenKey(tokenHash: string): string {
    return `vsp:security:revoked:${tokenHash}`;
  }

  sessionRevokedKey(userId: string): string {
    return `vsp:security:session:revoked:${userId}`;
  }
}

function normalizeAor(aor: string): string {
  return aor.trim().toLowerCase().replace(/^<|>$/g, '');
}

function createContactField(contact: string): string {
  const c = contact.trim().toLowerCase();
  // Prefer URI inside Contact header (drop params before hashing key)
  const m = c.match(/<?(sip:[^>;\s]+)>?/i);
  return (m?.[1] ?? c).slice(0, 512);
}
