import { Module } from '@nestjs/common';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { VoicemailRuntimeService } from './runtime/voicemail-runtime.service';

@Module({
  imports: [TelecomInfrastructureModule],
  providers: [VoicemailRuntimeService],
  exports: [VoicemailRuntimeService],
})
export class VoicemailCoreModule {}
