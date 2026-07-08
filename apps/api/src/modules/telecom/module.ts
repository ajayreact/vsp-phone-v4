import { MiddlewareConsumer, Module, NestModule, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { TelecomAuthorizationInterceptor } from '../enterprise-security/telecom/telecom-authorization.service';
import { WebrtcRateLimitGuard } from '../enterprise-security/guards/scoped-rate-limit.guards';
import { TelecomCorrelationMiddleware } from '../../common/telecom/telecom-correlation.middleware';
import { TelecomRateLimitGuard } from '../../common/telecom/telecom-rate-limit.guard';
import { TelecomServiceAuthGuard } from '../../common/telecom/telecom-service-auth.guard';
import { CallMediaCoreModule } from '../call-media/call-media-core.module';
import { CarrierModule } from '../carrier/module';
import { ConferenceCoreModule } from '../conference/conference-core.module';
import { IvrCoreModule } from '../ivr/ivr-core.module';
import { PresenceModule } from '../presence/module';
import { QueueCoreModule } from '../queue/queue-core.module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { VoicemailCoreModule } from '../voicemail/voicemail-core.module';
import { EnterpriseOpsCoreModule } from '../enterprise-ops/enterprise-ops-core.module';
import { SipCredentialVaultService } from './auth/sip-credential-vault.service';
import { SipDigestAuthService } from './auth/sip-digest-auth.service';
import { RegistrationEventsListener } from './events/registration-events.listener';
import { CallEventsListener } from './events/call-events.listener';
import { RegistrationService } from './registration/registration.service';
import { CallAppsResolverService } from './routing/call-apps-resolver.service';
import { CallAppsRoutingService, RoutingContinueService } from './routing/routing-continue.service';
import { RoutingService } from './routing/routing.service';
import { MediaLifecycleService } from './media/media-lifecycle.service';
import { BrowserPresenceService } from './webrtc/browser-presence.service';
import { WebrtcEnrollService } from './webrtc/webrtc-enroll.service';
import { WebrtcController } from './webrtc/webrtc.controller';
import { TelecomController } from './telecom.controller';
import { TELECOM_SERVICE } from './telecom.service.interface';
import { TelecomService } from './telecom.service';
import { TelecomInfrastructureModule } from './telecom-infrastructure.module';

@Module({
  imports: [
    TelecomInfrastructureModule,
    forwardRef(() => CarrierModule),
    AuthModule,
    RecordingCoreModule,
    PresenceModule,
    CallMediaCoreModule,
    QueueCoreModule,
    IvrCoreModule,
    ConferenceCoreModule,
    VoicemailCoreModule,
    EnterpriseOpsCoreModule,
    EnterpriseSecurityCoreModule,
  ],
  controllers: [TelecomController, WebrtcController],
  providers: [
    SipCredentialVaultService,
    SipDigestAuthService,
    RegistrationService,
    RegistrationEventsListener,
    CallAppsResolverService,
    CallAppsRoutingService,
    RoutingContinueService,
    RoutingService,
    MediaLifecycleService,
    WebrtcEnrollService,
    BrowserPresenceService,
    JwtAuthGuard,
    CallEventsListener,
    TelecomService,
    { provide: TELECOM_SERVICE, useExisting: TelecomService },
    TelecomServiceAuthGuard,
    TelecomRateLimitGuard,
    WebrtcRateLimitGuard,
    TelecomAuthorizationInterceptor,
  ],
  exports: [
    TelecomService,
    TELECOM_SERVICE,
    TelecomInfrastructureModule,
    SipCredentialVaultService,
  ],
})
export class TelecomModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TelecomCorrelationMiddleware).forRoutes(TelecomController);
  }
}
