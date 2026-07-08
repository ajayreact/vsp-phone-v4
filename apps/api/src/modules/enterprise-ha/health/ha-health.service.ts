import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { KamailioNodeRegistryService } from '../failover/kamailio-node-registry.service';
import { RtpengineNodeRegistryService } from '../failover/rtpengine-node-registry.service';
import { PostgresHaService } from '../replication/postgres-ha.service';
import { RedisHaService } from '../redis/redis-ha.service';
import { ShutdownCoordinatorService } from '../services/shutdown-coordinator.service';

/** Phase 17 — extended HA health aggregation + Redis snapshot persistence. */
@Injectable()
export class HaHealthService {
  constructor(
    private readonly config: ConfigService,
    private readonly enterpriseHealth: EnterpriseHealthService,
    private readonly redisHa: RedisHaService,
    private readonly postgresHa: PostgresHaService,
    private readonly kamailio: KamailioNodeRegistryService,
    private readonly rtpengine: RtpengineNodeRegistryService,
    private readonly shutdown: ShutdownCoordinatorService,
    private readonly redis: TelecomRedisService,
  ) {}

  async checkApi() {
    return {
      status: 'up' as const,
      version: 'remediation-complete',
      draining: this.shutdown.isDraining(),
    };
  }

  async checkAll(): Promise<Record<string, unknown>> {
    const [base, kamailioNodes, rtpengineNodes, redisProbe, postgresPrimary, postgresRead] =
      await Promise.all([
        this.enterpriseHealth.checkAll(),
        this.kamailio.checkAll(),
        this.rtpengine.checkAll(),
        this.redisHa.probe(),
        this.postgresHa.probePrimary(),
        this.postgresHa.probeReadReplica(),
      ]);

    const snapshot = {
      ts: new Date().toISOString(),
      api: await this.checkApi(),
      kamailioCluster: kamailioNodes,
      rtpengineCluster: rtpengineNodes,
      redisHa: redisProbe,
      postgresPrimary,
      postgresReadReplica: postgresRead,
      shutdown: { draining: this.shutdown.isDraining(), inFlight: this.shutdown.inFlightCount() },
    };

    setImmediate(() => {
      void this.redis.setex(
        this.redis.healthSnapshotKey('ha'),
        120,
        JSON.stringify(snapshot),
      );
    });

    return { ...base, ha: snapshot };
  }

  isReadyForTraffic(): boolean {
    if (this.shutdown.isDraining()) return false;
    if (String(this.config.get('READINESS_STRICT') ?? 'false').toLowerCase() !== 'true') {
      return true;
    }
    const kamailioNodes = this.kamailio.listNodes();
    const rtpNodes = this.rtpengine.listNodes();
    const kamOk =
      kamailioNodes.length === 0 || kamailioNodes.some((n) => n.status === 'up');
    const rtpOk = rtpNodes.length === 0 || rtpNodes.some((n) => n.status === 'up');
    return kamOk && rtpOk;
  }
}
