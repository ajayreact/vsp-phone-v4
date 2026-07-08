import { Module } from '@nestjs/common';
import { EnterpriseHaCoreModule } from './enterprise-ha-core.module';

@Module({
  imports: [EnterpriseHaCoreModule],
  exports: [EnterpriseHaCoreModule],
})
export class EnterpriseHaModule {}
