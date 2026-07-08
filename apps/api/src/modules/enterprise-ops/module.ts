import { Module } from '@nestjs/common';
import { EnterpriseOpsCoreModule } from './enterprise-ops-core.module';

@Module({
  imports: [EnterpriseOpsCoreModule],
  exports: [EnterpriseOpsCoreModule],
})
export class EnterpriseOpsModule {}
