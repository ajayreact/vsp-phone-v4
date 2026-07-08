import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProvEdgeController } from './controllers/prov-edge.controller';
import { ProvisioningCoreModule } from './provisioning-core.module';

/** Minimal HTTPS edge app module (ADR-042 — no API global prefix). */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    ProvisioningCoreModule,
  ],
  controllers: [ProvEdgeController],
})
export class ProvEdgeModule {}
