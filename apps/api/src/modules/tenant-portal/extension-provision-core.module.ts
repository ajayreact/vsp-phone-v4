import { Module } from '@nestjs/common';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { ExtensionAutoProvisionService } from './services/extension-auto-provision.service';
import { LineSipEndpointService } from './services/line-sip-endpoint.service';

/** Shared extension auto-provision (imported by carrier-admin without circular deps). */
@Module({
  imports: [TelecomInfrastructureModule, EnterpriseObservabilityCoreModule],
  providers: [ExtensionAutoProvisionService, LineSipEndpointService],
  exports: [ExtensionAutoProvisionService, LineSipEndpointService],
})
export class ExtensionProvisionCoreModule {}
