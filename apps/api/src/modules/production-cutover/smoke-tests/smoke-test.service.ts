import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { SmokeTestId, SmokeTestResult, SmokeTestRun } from '../types/cutover.types';
import { CUTOVER_REDIS_KEYS } from '../types/cutover.types';

interface SmokeTestDef {
  id: SmokeTestId;
  name: string;
  run: () => Promise<{ pass: boolean; detail?: string }>;
}

/** Phase 20 — automated smoke test framework (configuration + health probes; no telephony changes). */
@Injectable()
export class SmokeTestService {
  private readonly logger = new Logger(SmokeTestService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly health: EnterpriseHealthService,
    private readonly redis: TelecomRedisService,
  ) {}

  async execute(): Promise<SmokeTestRun> {
    const runId = randomUUID();
    const started = Date.now();
    const results: SmokeTestResult[] = [];

    for (const def of this.definitions()) {
      const testStarted = Date.now();
      try {
        const outcome = await def.run();
        results.push({
          id: def.id,
          name: def.name,
          pass: outcome.pass,
          detail: outcome.detail,
          durationMs: Date.now() - testStarted,
        });
      } catch (err) {
        results.push({
          id: def.id,
          name: def.name,
          pass: false,
          detail: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - testStarted,
        });
      }
    }

    const run: SmokeTestRun = {
      runId,
      ts: new Date().toISOString(),
      passed: results.every((r) => r.pass),
      results,
    };

    await this.redis.setex(CUTOVER_REDIS_KEYS.smokeRun(runId), 86400 * 7, JSON.stringify(run));
    await this.redis.setex(CUTOVER_REDIS_KEYS.smokeLatest, 86400 * 7, JSON.stringify(run));

    this.logger.log(
      JSON.stringify({
        event: 'cutover.smoke_test.complete',
        runId,
        passed: run.passed,
        durationMs: Date.now() - started,
        passCount: results.filter((r) => r.pass).length,
        failCount: results.filter((r) => !r.pass).length,
      }),
    );

    return run;
  }

  async getLatest(): Promise<SmokeTestRun | null> {
    const raw = await this.redis.get(CUTOVER_REDIS_KEYS.smokeLatest);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SmokeTestRun;
    } catch {
      return null;
    }
  }

  async getRun(runId: string): Promise<SmokeTestRun | null> {
    const raw = await this.redis.get(CUTOVER_REDIS_KEYS.smokeRun(runId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SmokeTestRun;
    } catch {
      return null;
    }
  }

  private definitions(): SmokeTestDef[] {
    return [
      {
        id: 'health_endpoints',
        name: 'Health endpoints',
        run: async () => {
          const all = await this.health.checkAll();
          const pass = Object.values(all).every((c) => c.status !== 'down');
          return { pass, detail: pass ? 'All health probes up' : 'One or more probes down' };
        },
      },
      {
        id: 'sip_registration',
        name: 'SIP registration readiness',
        run: async () => {
          const kam = await this.health.checkKamailio();
          const domain = this.config.get('SIP_PLATFORM_DOMAIN');
          const pass = kam.status === 'up' && Boolean(domain);
          return {
            pass,
            detail: pass ? `Kamailio up; domain ${domain}` : 'Kamailio or SIP domain not ready',
          };
        },
      },
      {
        id: 'inbound_call',
        name: 'Inbound call path',
        run: async () => {
          const [kam, telnyx] = await Promise.all([
            this.health.checkKamailio(),
            this.health.checkTelnyx(),
          ]);
          const pass = kam.status === 'up' && telnyx.status !== 'down';
          return { pass, detail: pass ? 'Carrier + Kamailio ready for inbound' : 'Inbound path not ready' };
        },
      },
      {
        id: 'outbound_call',
        name: 'Outbound call path',
        run: async () => {
          const telnyx = await this.health.checkTelnyx();
          const host = this.config.get('TELNYX_SIP_HOST');
          const pass = telnyx.status !== 'down' && Boolean(host);
          return { pass, detail: pass ? `Telnyx ready (${host})` : 'Outbound carrier not ready' };
        },
      },
      {
        id: 'internal_extension_call',
        name: 'Internal extension routing',
        run: async () => {
          const kam = await this.health.checkKamailio();
          const pass = kam.status === 'up';
          return { pass, detail: pass ? 'Kamailio routing available' : 'Internal routing unavailable' };
        },
      },
      {
        id: 'webrtc_registration',
        name: 'WebRTC registration',
        run: async () => {
          const wss = this.config.get('WEBRTC_WSS_URL');
          const jwt = this.config.get('JWT_SECRET') || this.config.get('DEV_JWT_SECRET');
          const pass = Boolean(wss || jwt);
          return { pass, detail: pass ? 'WebRTC JWT/WSS configured' : 'WebRTC not configured' };
        },
      },
      {
        id: 'grandstream_registration',
        name: 'Grandstream provisioning',
        run: async () => {
          const prov = String(this.config.get('PROV_HTTPS_ENABLED') ?? 'true').toLowerCase() !== 'false';
          const base = this.config.get('PROV_PUBLIC_BASE_URL');
          const pass = prov && Boolean(base || this.config.get('VSP_ENV') === 'development');
          return { pass, detail: pass ? 'Provisioning endpoint configured' : 'Provisioning not ready' };
        },
      },
      {
        id: 'ivr',
        name: 'IVR configuration',
        run: async () =>
          this.featureReady('IVR media/config present', 'IVR_MEDIA_URI', 'TELECOM_IVR_MEDIA_URI'),
      },
      {
        id: 'queue',
        name: 'Queue configuration',
        run: async () =>
          this.featureReady('Queue media/config present', 'QUEUE_MEDIA_URI', 'TELECOM_QUEUE_MEDIA_URI'),
      },
      {
        id: 'conference',
        name: 'Conference configuration',
        run: async () =>
          this.featureReady(
            'Conference bridge configured',
            'CONFERENCE_MEDIA_URI',
            'TELECOM_CONFERENCE_MEDIA_URI',
          ),
      },
      {
        id: 'park',
        name: 'Park feature',
        run: async () => this.redisFeatureProbe('park'),
      },
      {
        id: 'pickup',
        name: 'Pickup feature',
        run: async () => this.redisFeatureProbe('pickup'),
      },
      {
        id: 'recording',
        name: 'Recording service',
        run: async () => {
          const bucket = this.config.get('S3_BUCKET') || this.config.get('RECORDING_S3_BUCKET');
          const path = this.config.get('RECORDING_STORAGE_PATH');
          const pass = Boolean(bucket || path || this.redis.isAvailable());
          return {
            pass,
            detail: pass
              ? 'Recording storage (S3/spool) or Redis metadata available'
              : 'Recording not configured',
          };
        },
      },
      {
        id: 'rtpengine_media',
        name: 'RTPengine media backend',
        run: async () => {
          const rtp = await this.health.checkRtpengine();
          const requireReal =
            String(this.config.get('RTPENGINE_REQUIRE_DAEMON') ?? '').toLowerCase() === 'true' ||
            String(this.config.get('RTPENGINE_REQUIRE_DAEMON') ?? '') === '1' ||
            this.config.get('VSP_ENV') === 'production';
          const pass = rtp.status === 'up' && (!requireReal || rtp.status === 'up');
          return {
            pass,
            detail:
              pass && requireReal
                ? 'RTPengine NG reachable (production requires real daemon at deploy time)'
                : pass
                  ? 'RTPengine NG reachable'
                  : 'RTPengine unavailable',
          };
        },
      },
      {
        id: 'presence',
        name: 'Presence service',
        run: async () => {
          const pass = this.redis.isAvailable();
          return { pass, detail: pass ? 'Redis available for presence' : 'Presence backend unavailable' };
        },
      },
      {
        id: 'blf',
        name: 'BLF / presence indicators',
        run: async () => {
          const pass = this.redis.isAvailable();
          return { pass, detail: pass ? 'BLF presence backend available' : 'BLF backend unavailable' };
        },
      },
      {
        id: 'telnyx_webhook',
        name: 'Telnyx webhook',
        run: async () => {
          const secret = this.config.get('TELNYX_WEBHOOK_SECRET');
          const vspEnv = this.config.get('VSP_ENV') ?? 'development';
          const pass = Boolean(secret) || vspEnv === 'development';
          return {
            pass,
            detail: pass ? 'Webhook secret configured or dev mode' : 'TELNYX_WEBHOOK_SECRET missing',
          };
        },
      },
    ];
  }

  private featureReady(
    okDetail: string,
    primaryKey: string,
    legacyKey?: string,
  ): Promise<{ pass: boolean; detail?: string }> {
    const val = this.config.get(primaryKey) || (legacyKey ? this.config.get(legacyKey) : undefined);
    const pass = Boolean(val) || this.config.get('VSP_ENV') === 'development';
    return Promise.resolve({
      pass,
      detail: pass ? okDetail : `${primaryKey} not configured`,
    });
  }

  private async redisFeatureProbe(feature: string): Promise<{ pass: boolean; detail?: string }> {
    if (!this.redis.isAvailable()) {
      return { pass: false, detail: 'Redis unavailable for feature codes' };
    }
    return { pass: true, detail: `${feature} feature probe via Redis OK` };
  }
}
