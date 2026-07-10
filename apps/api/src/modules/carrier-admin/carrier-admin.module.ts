import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CarrierModule } from '../carrier/module';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { ExtensionsAdminController } from './controllers/extensions.controller';
import { LiveCallsAdminController } from './controllers/live-calls.controller';
import { TelnyxNumbersController } from './controllers/telnyx-numbers.controller';
import { TrunksAdminController } from './controllers/trunks.controller';
import { UsersAdminController } from './controllers/users.controller';
import { ExtensionsAdminService } from './services/extensions-admin.service';
import { LiveCallsAdminService } from './services/live-calls-admin.service';
import { TelnyxNumbersService } from './services/telnyx-numbers.service';
import { TrunksAdminService } from './services/trunks-admin.service';
import { UsersAdminService } from './services/users-admin.service';
import { TelnyxApiClient } from './telnyx-api.client';

@Module({
  imports: [TelecomInfrastructureModule, EnterpriseSecurityCoreModule, AuthModule, CarrierModule],
  controllers: [
    TelnyxNumbersController,
    TrunksAdminController,
    ExtensionsAdminController,
    LiveCallsAdminController,
    UsersAdminController,
  ],
  providers: [
    TelnyxApiClient,
    TelnyxNumbersService,
    TrunksAdminService,
    ExtensionsAdminService,
    LiveCallsAdminService,
    UsersAdminService,
  ],
  exports: [
    TelnyxNumbersService,
    TrunksAdminService,
    ExtensionsAdminService,
    LiveCallsAdminService,
    UsersAdminService,
  ],
})
export class CarrierAdminModule {}
