import { Module, forwardRef } from '@nestjs/common';
import { CallMediaCoreModule } from '../call-media/call-media-core.module';
import { ConferenceCoreModule } from '../conference/conference-core.module';
import { QueueCoreModule } from '../queue/queue-core.module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { VoicemailCoreModule } from '../voicemail/voicemail-core.module';
import { IvrEventsListener } from './events/ivr-events.listener';
import { IvrRuntimeService } from './runtime/ivr-runtime.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    CallMediaCoreModule,
    RecordingCoreModule,
    QueueCoreModule,
    forwardRef(() => ConferenceCoreModule),
    VoicemailCoreModule,
  ],
  providers: [IvrRuntimeService, IvrEventsListener],
  exports: [IvrRuntimeService],
})
export class IvrCoreModule {}
