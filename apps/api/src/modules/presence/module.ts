import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { AdminRateLimitGuard } from '../enterprise-security/guards/scoped-rate-limit.guards';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { PresenceController } from './controllers/presence.controller';
import { PresenceEventsListener } from './events/presence-events.listener';
import { DevicePresenceService } from './device-presence.service';
import { PresenceService } from './presence.service';
import { PresenceSubscriptionService } from './subscription/presence-subscription.service';
import { TelecomPresenceService } from './telecom-presence.service';

@Module({
  imports: [TelecomInfrastructureModule, AuthModule, EnterpriseSecurityCoreModule],
  controllers: [PresenceController],
  providers: [
    PresenceService,
    DevicePresenceService,
    PresenceEventsListener,
    PresenceSubscriptionService,
    TelecomPresenceService,
    AdminRateLimitGuard,
  ],
  exports: [
    PresenceService,
    DevicePresenceService,
    PresenceSubscriptionService,
    TelecomPresenceService,
  ],
})
export class PresenceModule {}
