import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TelecomServiceAuthGuard } from '../../common/telecom/telecom-service-auth.guard';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import {
  AdminRateLimitGuard,
  ProvisioningRateLimitGuard,
} from '../enterprise-security/guards/scoped-rate-limit.guards';
import { ProvisioningAdminController } from './controllers/provisioning-admin.controller';
import { ProvisioningInternalController } from './controllers/provisioning-internal.controller';
import { ProvisioningCoreModule } from './provisioning-core.module';

@Module({
  imports: [ProvisioningCoreModule, EnterpriseSecurityCoreModule],
  controllers: [ProvisioningAdminController, ProvisioningInternalController],
  providers: [JwtAuthGuard, TelecomServiceAuthGuard, ProvisioningRateLimitGuard, AdminRateLimitGuard],
})
export class ProvisioningModule {}
