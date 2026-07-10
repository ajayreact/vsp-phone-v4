import { Module } from '@nestjs/common';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { AudioMediaResolverService } from './audio-media-resolver.service';
import { MusicOnHoldService } from './music-on-hold.service';
import { PromptManagementService } from './prompt-management.service';

@Module({
  imports: [TelecomInfrastructureModule, RecordingCoreModule],
  providers: [AudioMediaResolverService, PromptManagementService, MusicOnHoldService],
  exports: [AudioMediaResolverService, PromptManagementService, MusicOnHoldService],
})
export class CallMediaCoreModule {}
