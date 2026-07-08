import { Module } from '@nestjs/common';
import { EnterpriseObservabilityCoreModule } from './enterprise-observability-core.module';

@Module({
  imports: [EnterpriseObservabilityCoreModule],
  exports: [EnterpriseObservabilityCoreModule],
})
export class EnterpriseObservabilityModule {}
