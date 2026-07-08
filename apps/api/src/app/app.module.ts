import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../modules/auth/auth.module';
import { CarrierModule } from '../modules/carrier';
import { PresenceModule } from '../modules/presence';
import { EnterpriseObservabilityModule } from '../modules/enterprise-observability';
import { EnterpriseSecurityModule } from '../modules/enterprise-security';
import { EnterpriseHaModule } from '../modules/enterprise-ha';
import { ProductionPlatformModule } from '../modules/production-platform';
import { MigrationToolkitModule } from '../modules/migration-toolkit';
import { ProductionCutoverModule } from '../modules/production-cutover';
import { ProvisioningModule } from '../modules/provisioning';
import { RecordingModule } from '../modules/recording';
import { TelecomModule } from '../modules/telecom';
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
    ProvisioningModule,
    RecordingModule,
    PresenceModule,
    EnterpriseObservabilityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
