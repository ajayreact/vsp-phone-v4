import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { RecordingCleanupService } from './cleanup/recording-cleanup.service';
import { RecordingEventsListener } from './events/recording-events.listener';
import { RecordingLifecycleService } from './lifecycle/recording-lifecycle.service';
import { RecordingPolicyService } from './policy/recording-policy.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { RecordingUploadService } from './upload/recording-upload.service';

@Module({
  imports: [TelecomInfrastructureModule, AuthModule],
  providers: [
    ObjectStorageService,
    RecordingUploadService,
    RecordingPolicyService,
    RecordingLifecycleService,
    RecordingCleanupService,
    RecordingEventsListener,
  ],
  exports: [
    ObjectStorageService,
    RecordingPolicyService,
    RecordingLifecycleService,
    RecordingCleanupService,
  ],
})
export class RecordingCoreModule {}
