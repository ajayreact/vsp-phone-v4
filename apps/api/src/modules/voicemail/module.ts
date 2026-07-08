import { Module } from '@nestjs/common';
import { VoicemailCoreModule } from './voicemail-core.module';

@Module({
  imports: [VoicemailCoreModule],
  exports: [VoicemailCoreModule],
})
export class VoicemailModule {}
