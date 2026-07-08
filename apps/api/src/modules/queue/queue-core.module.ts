import { Module, forwardRef } from '@nestjs/common';
import { CallMediaCoreModule } from '../call-media/call-media-core.module';
import { PresenceModule } from '../presence/module';
import { RecordingCoreModule } from '../recording/recording-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { QueueEventsListener } from './events/queue-events.listener';
import { QueueAgentSelectionService } from './runtime/queue-agent-selection.service';
import { QueueRuntimeService } from './runtime/queue-runtime.service';

@Module({
  imports: [
    TelecomInfrastructureModule,
    PresenceModule,
    RecordingCoreModule,
    CallMediaCoreModule,
  ],
  providers: [QueueAgentSelectionService, QueueRuntimeService, QueueEventsListener],
  exports: [QueueRuntimeService, QueueAgentSelectionService],
})
export class QueueCoreModule {}
