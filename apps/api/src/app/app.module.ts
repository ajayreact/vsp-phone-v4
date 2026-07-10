import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../modules/auth/auth.module';
import { CarrierModule } from '../modules/carrier';
import { CarrierAdminModule } from '../modules/carrier-admin/carrier-admin.module';
import { PlatformAdminModule } from '../modules/platform-admin/platform-admin.module';
import { PresenceModule } from '../modules/presence';
import { EnterpriseObservabilityModule } from '../modules/enterprise-observability';
import { EnterpriseSecurityModule } from '../modules/enterprise-security';
import { EnterpriseHaModule } from '../modules/enterprise-ha';
import { OpsCenterModule } from '../modules/ops-center/ops-center.module';
import { ProductionPlatformModule } from '../modules/production-platform';
import { MigrationToolkitModule } from '../modules/migration-toolkit';
import { ProductionCutoverModule } from '../modules/production-cutover';
import { ProvisioningModule } from '../modules/provisioning';
import { RecordingModule } from '../modules/recording';
import { TelecomModule } from '../modules/telecom';
import { TenantPortalModule } from '../modules/tenant-portal/tenant-portal.module';
import { SupervisorConsoleModule } from '../modules/supervisor-console/supervisor-console.module';
import { validateEnv } from './env.validation';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    EnterpriseSecurityModule,
    EnterpriseHaModule,
    ProductionPlatformModule,
    MigrationToolkitModule,
    ProductionCutoverModule,
    AuthModule,
    TelecomModule,
    CarrierModule,
    CarrierAdminModule,
    PlatformAdminModule,
    ProvisioningModule,
    RecordingModule,
    PresenceModule,
    EnterpriseObservabilityModule,
    OpsCenterModule,
    SupervisorConsoleModule,
    TenantPortalModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
