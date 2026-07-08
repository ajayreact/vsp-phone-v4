import { Module } from '@nestjs/common';
import { CallMediaCoreModule } from '../call-media/call-media-core.module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { ConferenceEventsListener } from './events/conference-events.listener';
import { ConferenceRuntimeService } from './runtime/conference-runtime.service';

@Module({
  imports: [TelecomInfrastructureModule, RecordingCoreModule, CallMediaCoreModule],
  providers: [ConferenceRuntimeService, ConferenceEventsListener],
  exports: [ConferenceRuntimeService],
})
export class ConferenceCoreModule {}
