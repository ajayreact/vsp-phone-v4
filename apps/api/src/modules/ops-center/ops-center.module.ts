import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseHaCoreModule } from '../enterprise-ha/enterprise-ha-core.module';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { ProductionPlatformCoreModule } from '../production-platform/production-platform-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { OpsCenterController } from './controllers/ops-center.controller';
import { OpsSipRegistrationsService } from './services/ops-sip-registrations.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    EnterpriseObservabilityCoreModule,
    EnterpriseHaCoreModule,
    EnterpriseSecurityCoreModule,
    AuthModule,
    ProductionPlatformCoreModule,
  ],
  controllers: [OpsCenterController],
  providers: [OpsSipRegistrationsService],
})
export class OpsCenterModule {}
