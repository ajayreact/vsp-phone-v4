import { Module } from '@nestjs/common';
import { TelecomServiceAuthGuard } from '../../common/telecom/telecom-service-auth.guard';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { CARRIER_ADAPTER } from './carrier-adapter.interface';
import { CarrierController } from './carrier.controller';
import { CarrierService } from './carrier.service';
import { TelnyxCarrierAdapter } from './telnyx.carrier-adapter';

@Module({
  imports: [TelecomInfrastructureModule],
  controllers: [CarrierController],
  providers: [
    TelnyxCarrierAdapter,
    { provide: CARRIER_ADAPTER, useExisting: TelnyxCarrierAdapter },
    CarrierService,
    TelecomServiceAuthGuard,
  ],
  exports: [CarrierService, TelnyxCarrierAdapter, CARRIER_ADAPTER],
})
export class CarrierModule {}
