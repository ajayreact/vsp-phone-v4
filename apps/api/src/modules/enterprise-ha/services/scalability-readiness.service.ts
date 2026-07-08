import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { InstanceIdentityService } from '../clustering/instance-identity.service';
import { KamailioNodeRegistryService } from '../failover/kamailio-node-registry.service';
import { RtpengineNodeRegistryService } from '../failover/rtpengine-node-registry.service';
import { PostgresHaService } from '../replication/postgres-ha.service';
import { RedisHaService } from '../redis/redis-ha.service';
import { StatelessRuntimeService } from '../sessions/stateless-runtime.service';
import { ShutdownCoordinatorService } from '../services/shutdown-coordinator.service';
import { BackupDrService } from '../services/backup-dr.service';

export interface ScalabilityReadinessReport {
  ts: string;
  phase: 'phase17-enterprise-ha';
  instance: Record<string, string>;
  stateless: ReturnType<StatelessRuntimeService['validate']>;
  horizontalApiScaling: { ready: boolean; stickySessionRequired: false; note: string };
  redis: { ready: boolean; config: Record<string, unknown>; probe: Awaited<ReturnType<RedisHaService['probe']>> };
  postgres: {
    ready: boolean;
    config: Record<string, unknown>;
    primary: Awaited<ReturnType<PostgresHaService['probePrimary']>>;
    readReplica: Awaited<ReturnType<PostgresHaService['probeReadReplica']>>;
  };
  kamailio: { ready: boolean; nodes: ReturnType<KamailioNodeRegistryService['listNodes']> };
  rtpengine: { ready: boolean; nodes: ReturnType<RtpengineNodeRegistryService['listNodes']> };
  loadBalancer: { trustProxy: boolean; stickySessionIndependent: true };
  gracefulShutdown: { draining: boolean; inFlight: number };
  disasterRecovery: ReturnType<BackupDrService['status']>;
  components: Awaited<ReturnType<EnterpriseHealthService['checkAll']>>;
}

/** Phase 17 — scalability / HA readiness report (read-only). */
@Injectable()
export class ScalabilityReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly identity: InstanceIdentityService,
    private readonly stateless: StatelessRuntimeService,
    private readonly redisHa: RedisHaService,
    private readonly postgresHa: PostgresHaService,
    private readonly kamailio: KamailioNodeRegistryService,
    private readonly rtpengine: RtpengineNodeRegistryService,
    private readonly shutdown: ShutdownCoordinatorService,
    private readonly backupDr: BackupDrService,
    private readonly health: EnterpriseHealthService,
  ) {}

  async buildReport(): Promise<ScalabilityReadinessReport> {
    const [redisProbe, primary, readReplica, components] = await Promise.all([
      this.redisHa.probe(),
      this.postgresHa.probePrimary(),
      this.postgresHa.probeReadReplica(),
      this.health.checkAll(),
    ]);

    const kamailioNodes = this.kamailio.listNodes();
    const rtpengineNodes = this.rtpengine.listNodes();

    return {
      ts: new Date().toISOString(),
      phase: 'phase17-enterprise-ha',
      instance: this.identity.describe(),
      stateless: this.stateless.validate(),
      horizontalApiScaling: {
        ready: true,
        stickySessionRequired: false,
        note: 'API instances are stateless; scale horizontally behind load balancer.',
      },
      redis: {
        ready: redisProbe.available,
        config: this.redisHa.describeConfig(),
        probe: redisProbe,
      },
      postgres: {
        ready: primary.status === 'up',
        config: this.postgresHa.describeConfig(),
        primary,
        readReplica,
      },
      kamailio: {
        ready: kamailioNodes.some((n) => n.status === 'up'),
        nodes: kamailioNodes,
      },
      rtpengine: {
        ready: rtpengineNodes.some((n) => n.status === 'up'),
        nodes: rtpengineNodes,
      },
      loadBalancer: {
        trustProxy: String(this.config.get('TRUST_PROXY') ?? 'false').toLowerCase() === 'true',
        stickySessionIndependent: true,
      },
      gracefulShutdown: {
        draining: this.shutdown.isDraining(),
        inFlight: this.shutdown.inFlightCount(),
      },
      disasterRecovery: this.backupDr.status(),
      components,
    };
  }
}
