import { Module, forwardRef } from '@nestjs/common';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { TelecomModule } from '../telecom/module';
import { CARRIER_ADAPTER } from './carrier-adapter.interface';
import { CarrierController } from './carrier.controller';
import { CarrierService } from './carrier.service';
import { TelnyxCarrierAdapter } from './telnyx.carrier-adapter';

@Module({
  imports: [TelecomInfrastructureModule, forwardRef(() => TelecomModule)],
  controllers: [CarrierController],
  providers: [
    TelnyxCarrierAdapter,
    { provide: CARRIER_ADAPTER, useExisting: TelnyxCarrierAdapter },
    CarrierService,
  ],
  exports: [CarrierService, TelnyxCarrierAdapter, CARRIER_ADAPTER],
})
export class CarrierModule {}
