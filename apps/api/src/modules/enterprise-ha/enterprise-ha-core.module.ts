import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { BackupOrchestrationService } from './backup/backup-orchestration.service';
import { KamailioPersistenceService } from './backup/kamailio-persistence.service';
import { InstanceIdentityService } from './clustering/instance-identity.service';
import { HaController } from './controllers/ha.controller';
import { FailureRecoveryService } from './failover/failure-recovery.service';
import { KamailioNodeRegistryService } from './failover/kamailio-node-registry.service';
import { RtpengineNodeRegistryService } from './failover/rtpengine-node-registry.service';
import { HaHealthService } from './health/ha-health.service';
import { LoadBalancerMiddleware } from './loadbalancing/load-balancer.middleware';
import { PostgresHaService } from './replication/postgres-ha.service';
import { RedisHaService } from './redis/redis-ha.service';
import { StatelessRuntimeService } from './sessions/stateless-runtime.service';
import { BackupDrService } from './services/backup-dr.service';
import {
  GracefulShutdownService,
  InFlightInterceptor,
} from './services/graceful-shutdown.service';
import { ScalabilityReadinessService } from './services/scalability-readiness.service';
import { ShutdownCoordinatorService } from './services/shutdown-coordinator.service';

@Module({
  imports: [TelecomInfrastructureModule, EnterpriseObservabilityCoreModule],
  controllers: [HaController],
  providers: [
    InstanceIdentityService,
    RedisHaService,
    PostgresHaService,
    KamailioNodeRegistryService,
    RtpengineNodeRegistryService,
    FailureRecoveryService,
    HaHealthService,
    StatelessRuntimeService,
    ShutdownCoordinatorService,
    GracefulShutdownService,
    BackupDrService,
    BackupOrchestrationService,
    KamailioPersistenceService,
    ScalabilityReadinessService,
    LoadBalancerMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useFactory: (shutdown: ShutdownCoordinatorService) => new InFlightInterceptor(shutdown),
      inject: [ShutdownCoordinatorService],
    },
  ],
  exports: [
    InstanceIdentityService,
    RedisHaService,
    PostgresHaService,
    KamailioNodeRegistryService,
    RtpengineNodeRegistryService,
    HaHealthService,
    ShutdownCoordinatorService,
    ScalabilityReadinessService,
    BackupOrchestrationService,
    KamailioPersistenceService,
    LoadBalancerMiddleware,
  ],
})
export class EnterpriseHaCoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoadBalancerMiddleware).forRoutes('*');
  }
}
